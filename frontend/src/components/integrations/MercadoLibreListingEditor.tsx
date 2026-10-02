"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type {
  MercadoLibreCategoryDto,
  MercadoLibreOptionDto,
  PortalListing,
  PortalOperationOverviewDto,
} from "@/generated/openapi";
import type { Property } from "@/types/property";
import { portalsApi } from "@/lib/api/portals";
import {
  mercadoLibreApi,
  type MercadoLibreStatus,
} from "@/lib/api/mercadolibre";
import { propertiesApi } from "@/lib/api/properties";
import {
  initialListingForm,
  attributeDefaults,
  listingPayload,
  type ListingForm,
} from "@/lib/mercadolibre-listing";
import { MercadoLibreListingFields } from "./MercadoLibreListingFields";

type EditorData = {
  property: Property;
  listing: PortalListing | null;
  connection: MercadoLibreStatus;
  overview: PortalOperationOverviewDto | null;
};
type Mutation = "publish" | "pause" | "close" | "save";
async function persistListing(
  action: Mutation,
  listing: PortalListing | null,
  propertyId: string,
  payload?: Record<string, unknown>,
): Promise<PortalListing> {
  if (action === "save")
    return listing
      ? portalsApi.update(listing.id, payload!)
      : portalsApi.create(propertyId, payload!);
  if (!listing) throw new Error("Listing missing");
  switch (action) {
    case "publish":
      await portalsApi.publish(listing.id);
      break;
    case "pause":
      await portalsApi.pause(listing.id);
      break;
    case "close":
      await portalsApi.close(listing.id);
      break;
  }
  return listing;
}
function EditorForm({
  data,
  reload,
}: Readonly<{ data: EditorData; reload: () => void }>) {
  const t = useTranslations("portalEditor");
  const locale = useLocale();
  const [listing, setListing] = useState(data.listing);
  const [overview, setOverview] = useState(data.overview);
  const [form, setForm] = useState(() =>
    initialListingForm(data.property, data.listing),
  );
  const [category, setCategory] = useState<MercadoLibreCategoryDto | null>(
    null,
  );
  const [states, setStates] = useState<MercadoLibreOptionDto[]>([]);
  const [cities, setCities] = useState<MercadoLibreOptionDto[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<MercadoLibreOptionDto[]>(
    [],
  );
  const [busy, setBusy] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState(false);
  const [confirmation, setConfirmation] = useState<Mutation | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const catalogGeneration = useRef(0);
  const mounted = useRef(true);
  const published = !!listing?.externalId;
  const job = overview?.job;
  const operationPending =
    !!job &&
    ["queued", "dispatching", "retry", "needs_review"].includes(job.status);
  const closed = listing?.providerStatus === "closed";
  useEffect(() => {
    let active = true;
    mounted.current = true;
    const id = initialListingForm(data.property, data.listing).categoryId;
    Promise.all([portalsApi.category(id), portalsApi.states()]).then(
      ([result, provinces]) => {
        if (active) {
          setCategory(result);
          setStates(provinces);
          setForm((value) => ({
            ...value,
            attributes: attributeDefaults(result, data.listing),
          }));
          setBusy(false);
        }
      },
      () => {
        if (active) {
          setBlocked(true);
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      catalogGeneration.current++;
    };
  }, [data]);
  const change = (value: ListingForm) => {
    setForm(value);
    setDirty(true);
    setSaved(false);
    setValidation(false);
    setConfirmation(null);
    setConfirmed(false);
  };
  const selectCatalog = async (
    kind: "category" | "state" | "city",
    id: string,
  ) => {
    if (pending.current || busy || blocked) return;
    const generation = ++catalogGeneration.current;
    setBusy(true);
    setValidation(false);
    try {
      if (kind === "category") await selectCategory(id, generation);
      else await selectLocation(kind, id, generation);
    } catch {
      if (mounted.current && generation === catalogGeneration.current)
        setBlocked(true);
    } finally {
      if (mounted.current && generation === catalogGeneration.current)
        setBusy(false);
    }
  };
  const selectLocation = async (
    kind: "state" | "city",
    id: string,
    generation: number,
  ) => {
    const read =
      kind === "state" ? portalsApi.cities : portalsApi.neighborhoods;
    const values = id ? await read(id) : [];
    if (generation !== catalogGeneration.current || !mounted.current) return;
    if (kind === "state") {
      setCities(values);
      setNeighborhoods([]);
      change({ ...form, stateId: id, cityId: "", neighborhoodId: "" });
    } else {
      setNeighborhoods(values);
      change({ ...form, cityId: id, neighborhoodId: "" });
    }
  };
  const selectCategory = async (id: string, generation: number) => {
    const next = await portalsApi.category(id);
    if (generation !== catalogGeneration.current || !mounted.current) return;
    setCategory(next);
    change({
      ...form,
      categoryId: next.id,
      listingType: "",
      attributes: attributeDefaults(next, null),
      currency: next.currencies.includes(form.currency)
        ? form.currency
        : (next.currencies[0] ?? ""),
    });
  };
  const mutate = async (action: Mutation) => {
    if (
      pending.current ||
      busy ||
      blocked ||
      operationPending ||
      closed ||
      !category
    )
      return;
    if (
      action !== "save" &&
      (!listing || dirty || !confirmed || confirmation !== action)
    )
      return;
    let payload: Record<string, unknown> | undefined;
    if (action === "save") {
      try {
        payload = listingPayload(form, category, listing);
      } catch {
        setValidation(true);
        return;
      }
    }
    pending.current = true;
    setBusy(true);
    setBlocked(false);
    setSaved(false);
    setConfirmation(null);
    setConfirmed(false);
    try {
      const current = await persistListing(
        action,
        listing,
        data.property.id,
        payload,
      );
      const [latest, operation] = await Promise.all([
        portalsApi.get(current!.id),
        portalsApi.operation(current!.id),
      ]);
      if (!mounted.current) return;
      setListing(latest);
      setOverview(operation);
      setDirty(false);
      setSaved(action === "save" && !latest.externalId);
      setForm({
        ...initialListingForm(data.property, latest),
        attributes: attributeDefaults(category, latest),
      });
    } catch {
      if (mounted.current) setBlocked(true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const writeDisabled = busy || blocked || operationPending || closed;
  return (
    <section aria-busy={busy} className="space-y-5">
      {blocked && <p role="alert">{t("uncertain")}</p>}
      {validation && <p role="alert">{t("invalid")}</p>}
      {saved && <output>{t("saved")}</output>}
      {job && <output>{t(`operation.${job.status}`)}</output>}
      {closed && <output>{t("closed")}</output>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={reload}
        >
          {t("reload")}
        </button>
        <Link
          href={`/${locale}/properties/${data.property.id}/portals`}
          className="underline"
        >
          {t("review")}
        </Link>
      </div>
      {category && (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate("save");
          }}
        >
          <fieldset disabled={writeDisabled} className="space-y-5">
            <div className="space-y-2">
              <h2 className="font-semibold">{t("category")}</h2>
              <p>{category.path.map((entry) => entry.name).join(" / ")}</p>
              {!published && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {category.path.slice(0, -1).map((entry) => (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        key={entry.id}
                        onClick={() => void selectCatalog("category", entry.id)}
                      >
                        {entry.name}
                      </button>
                    ))}
                  </div>
                  {category.children.length > 0 && (
                    <label className="block">
                      {t("subcategory")}
                      <select
                        className="mt-1 block w-full rounded border p-2"
                        value=""
                        onChange={(event) => {
                          if (event.target.value)
                            void selectCatalog("category", event.target.value);
                        }}
                      >
                        <option value="">{t("choose")}</option>
                        {category.children.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
            {(category.listingAllowed || published) && (
              <>
                <MercadoLibreListingFields
                  form={form}
                  setForm={change}
                  category={category}
                  published={published}
                  states={states}
                  cities={cities}
                  neighborhoods={neighborhoods}
                  changeState={(id) => void selectCatalog("state", id)}
                  changeCity={(id) => void selectCatalog("city", id)}
                />
                <button type="submit" className="btn btn-primary">
                  {published ? t("saveUpdate") : t("saveDraft")}
                </button>
              </>
            )}
          </fieldset>
        </form>
      )}
      {listing && (
        <div className="space-y-3">
          <p>{t("separatePublication")}</p>
          {dirty && <p>{t("unsaved")}</p>}
          <div className="flex flex-wrap gap-3">
            {(!published || listing.providerStatus === "paused") && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={writeDisabled || dirty}
                onClick={() => {
                  setConfirmation("publish");
                  setConfirmed(false);
                }}
              >
                {published ? t("resume") : t("publish")}
              </button>
            )}
            {published && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={
                    writeDisabled ||
                    dirty ||
                    listing.providerStatus === "paused"
                  }
                  onClick={() => {
                    setConfirmation("pause");
                    setConfirmed(false);
                  }}
                >
                  {t("pause")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={writeDisabled || dirty}
                  onClick={() => {
                    setConfirmation("close");
                    setConfirmed(false);
                  }}
                >
                  {t("close")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {confirmation && (
        <div className="space-y-3 rounded border p-4">
          <p>{t(`confirm.${confirmation}`)}</p>
          {confirmation === "publish" && (
            <p>
              {t("publicationSummary", {
                title: form.title,
                price: form.price,
                currency: form.currency,
                type:
                  category?.listingTypes.find(
                    (type) => type.id === form.listingType,
                  )?.name ?? t("currentType"),
              })}
            </p>
          )}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{t("confirmation")}</span>
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setConfirmation(null);
                setConfirmed(false);
              }}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!confirmed || writeDisabled}
              onClick={() => void mutate(confirmation)}
            >
              {t("confirmAction")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
export function MercadoLibreListingEditor({
  propertyId,
}: Readonly<{ propertyId: string }>) {
  const t = useTranslations("portalEditor");
  const locale = useLocale();
  const [data, setData] = useState<EditorData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [property, listings, connection] = await Promise.all([
          propertiesApi.getById(propertyId),
          portalsApi.list(propertyId),
          mercadoLibreApi.status(),
        ]);
        if (!property) throw new Error("Property not found");
        const listing =
          listings.find((item) => item.portal === "mercadolibre") ?? null;
        const overview = listing
          ? await portalsApi.operation(listing.id)
          : null;
        if (active) {
          setData({ property, listing, connection, overview });
          setBusy(false);
          setError(false);
        }
      } catch {
        if (active) {
          setError(true);
          setBusy(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [propertyId, generation]);
  const reload = () => {
    setBusy(true);
    setData(null);
    setGeneration((value) => value + 1);
  };
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Link href={`/${locale}/settings/mercadolibre`} className="underline">
        {t("connection")}
      </Link>
      {busy && <output>{t("loading")}</output>}
      {!busy && error && (
        <>
          <p role="alert">{t("loadError")}</p>
          <button type="button" className="btn btn-secondary" onClick={reload}>
            {t("reload")}
          </button>
        </>
      )}
      {!busy && !error && data && (
        <>
          <h2 className="text-lg font-semibold">{data.property.name}</h2>
          {!data.connection.enabled && <output>{t("disabled")}</output>}
          {data.connection.enabled && data.connection.status !== "active" && (
            <output>{t("connectionRequired")}</output>
          )}
          {data.connection.enabled && data.connection.status === "active" && (
            <EditorForm
              key={`${propertyId}:${generation}`}
              data={data}
              reload={reload}
            />
          )}
        </>
      )}
    </div>
  );
}
