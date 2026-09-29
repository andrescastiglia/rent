"use client";
import { useTranslations } from "next-intl";
import type {
  MercadoLibreCategoryDto,
  MercadoLibreOptionDto,
} from "@/generated/openapi";
import type { ListingForm } from "@/lib/mercadolibre-listing";
type TextField = Exclude<keyof ListingForm, "attributes" | "replaceLocation">;
export function MercadoLibreListingFields({
  form,
  setForm,
  category,
  published,
  states,
  cities,
  neighborhoods,
  changeState,
  changeCity,
}: Readonly<{
  form: ListingForm;
  setForm: (value: ListingForm) => void;
  category: MercadoLibreCategoryDto;
  published: boolean;
  states: MercadoLibreOptionDto[];
  cities: MercadoLibreOptionDto[];
  neighborhoods: MercadoLibreOptionDto[];
  changeState: (id: string) => void;
  changeCity: (id: string) => void;
}>) {
  const t = useTranslations("portalEditor");
  const field = (
    key: TextField,
    required = false,
    type = "text",
    locked = false,
  ) => (
    <label className="block" key={key}>
      {t(`fields.${key}`)}
      <input
        className="mt-1 block w-full rounded border p-2"
        type={type}
        value={form[key]}
        required={required}
        disabled={locked}
        maxLength={key === "title" ? 256 : 512}
        min={type === "number" ? 0.01 : undefined}
        step={type === "number" ? 0.01 : undefined}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
    </label>
  );
  const select = (
    key: TextField,
    options: MercadoLibreOptionDto[],
    onChange: (id: string) => void,
    required = true,
  ) => (
    <label className="block" key={key}>
      {t(`fields.${key}`)}
      <select
        className="mt-1 block w-full rounded border p-2"
        value={form[key]}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("choose")}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-5">
      {field("title", true)}
      <div className="grid gap-4 md:grid-cols-2">
        {field("price", true, "number")}
        {published ? (
          <p>{t("currencyValue", { currency: form.currency })}</p>
        ) : (
          select(
            "currency",
            category.currencies.map((id) => ({ id, name: id })),
            (value) => setForm({ ...form, currency: value }),
          )
        )}
      </div>
      {published ? (
        <p>{t("immutable")}</p>
      ) : (
        select("listingType", category.listingTypes, (value) =>
          setForm({ ...form, listingType: value }),
        )
      )}
      <label className="block">
        {t("fields.description")}
        <textarea
          className="mt-1 block min-h-28 w-full rounded border p-2"
          value={form.description}
          required
          maxLength={50000}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
      </label>
      <label className="block">
        {t("fields.pictures")}
        <textarea
          className="mt-1 block min-h-24 w-full rounded border p-2"
          value={form.pictures}
          required
          onChange={(event) =>
            setForm({ ...form, pictures: event.target.value })
          }
        />
      </label>
      <fieldset className="space-y-4 rounded border p-4">
        <legend>{t("attributes")}</legend>
        {category.attributes.map((attribute) => {
          const current = form.attributes[attribute.id] ?? {
            value: "",
            unit: attribute.defaultUnit ?? "",
          };
          const update = (value: string, unit = current.unit) =>
            setForm({
              ...form,
              attributes: {
                ...form.attributes,
                [attribute.id]: { value, unit },
              },
            });
          return (
            <div key={attribute.id} className="space-y-2">
              <label className="block">
                {attribute.name}
                {attribute.required ? " *" : ""}
                {attribute.values.length ? (
                  <select
                    className="mt-1 block w-full rounded border p-2"
                    value={current.value}
                    required={attribute.required}
                    disabled={attribute.readOnly}
                    onChange={(event) => update(event.target.value)}
                  >
                    <option value="">{t("choose")}</option>
                    {attribute.values.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="mt-1 block w-full rounded border p-2"
                    value={current.value}
                    required={attribute.required}
                    disabled={attribute.readOnly}
                    maxLength={attribute.maxLength}
                    type={
                      ["number", "number_unit"].includes(attribute.valueType)
                        ? "number"
                        : "text"
                    }
                    step="any"
                    onChange={(event) => update(event.target.value)}
                  />
                )}
              </label>
              {attribute.valueType === "number_unit" && (
                <label className="block">
                  {t("unit", { name: attribute.name })}
                  <select
                    className="mt-1 block rounded border p-2"
                    value={current.unit}
                    disabled={attribute.readOnly}
                    onChange={(event) =>
                      update(current.value, event.target.value)
                    }
                  >
                    {attribute.units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          );
        })}
      </fieldset>
      <fieldset className="space-y-4 rounded border p-4" disabled={published}>
        <legend>{t("contact")}</legend>
        <div className="grid gap-4 md:grid-cols-2">
          {field("contact", !published)}
          {field("email", false, "email")}
          {field("countryCode")}
          {field("areaCode", !published)}
          {field("phone", !published)}
          {field("countryCode2", !published)}
          {field("areaCode2")}
          {field("phone2", !published)}
        </div>
      </fieldset>
      <fieldset className="space-y-4 rounded border p-4" disabled={published}>
        <legend>{t("location")}</legend>
        {!form.replaceLocation && (
          <>
            <p>{form.address}</p>
            {!published && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setForm({
                    ...form,
                    replaceLocation: true,
                    stateId: "",
                    cityId: "",
                    neighborhoodId: "",
                  })
                }
              >
                {t("changeLocation")}
              </button>
            )}
          </>
        )}
        {form.replaceLocation && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {select("stateId", states, changeState)}
              {select("cityId", cities, changeCity)}
              {select(
                "neighborhoodId",
                neighborhoods,
                (value) => setForm({ ...form, neighborhoodId: value }),
                false,
              )}
            </div>
            {field("address", !published)}
            {field("zipCode")}
          </>
        )}
      </fieldset>
    </div>
  );
}
