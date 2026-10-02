"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  portalsApi,
  safePortalLink,
  type PortalListing,
  type PortalOperationOverviewDto,
  type PortalCandidateDto,
  type PortalResolutionDto,
  type ResolvePortalPublicationDto,
} from "@/lib/api/portals";
import { mercadoLibreApi } from "@/lib/api/mercadolibre";

function ReviewCard({
  listing: initialListing,
}: Readonly<{ listing: PortalListing }>) {
  const [listing, setListing] = useState(initialListing);
  const t = useTranslations("portalReview");
  const [overview, setOverview] = useState<PortalOperationOverviewDto | null>(
    null,
  );
  const [history, setHistory] = useState<PortalResolutionDto[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [action, setAction] = useState<
    ResolvePortalPublicationDto["action"] | ""
  >("");
  const [externalId, setExternalId] = useState("");
  const [candidate, setCandidate] = useState<PortalCandidateDto | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  const load = async () => {
    const [operation, events, currentListing] = await Promise.all([
      portalsApi.operation(listing.id),
      portalsApi.history(listing.id),
      portalsApi.get(listing.id),
    ]);
    return { operation, events, currentListing };
  };
  useEffect(() => {
    let active = true;
    Promise.all([
      portalsApi.operation(listing.id),
      portalsApi.history(listing.id),
    ]).then(
      ([operation, events]) => {
        if (active) {
          setOverview(operation);
          setHistory(events);
          setBusy(false);
        }
      },
      () => {
        if (active) {
          setError(true);
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [listing.id]);
  const job = overview?.job;
  const reviewable = job && ["needs_review", "failed"].includes(job.status);
  const unresolvedCreation =
    job?.operation === "publish" && !listing.externalId;
  const retryAllowed =
    !!listing.externalId ||
    (job?.status === "failed" && job.errorCode === "provider_rejected");
  const enabled = !!overview?.enabled;
  const canWrite = enabled && !busy && !error;
  const validResolution =
    !!job &&
    !!action &&
    confirmed &&
    reason.trim().length >= 10 &&
    reason.trim().length <= 1000 &&
    (action !== "link" || candidate?.id === externalId.trim());
  const resolutionPayload = (): ResolvePortalPublicationDto => ({
    action: action as ResolvePortalPublicationDto["action"],
    reason: reason.trim(),
    ...(action === "link" ? { externalId: externalId.trim() } : {}),
    ...(action === "confirm_not_created"
      ? { confirmedNoPublication: true }
      : {}),
  });
  const execute = async (
    operation: "read" | "candidate" | "resolve" | "refresh",
  ) => {
    if (inFlight.current || busy || (operation !== "read" && !canWrite)) return;
    if (operation === "resolve" && !validResolution) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      if (operation === "candidate") {
        setCandidate(
          await portalsApi.candidate(listing.id, job!.id, externalId.trim()),
        );
      } else {
        if (operation === "resolve")
          await portalsApi.resolve(listing.id, job!.id, resolutionPayload());
        if (operation === "refresh") await portalsApi.refresh(listing.id);
        const result = await load();
        setOverview(result.operation);
        setHistory(result.events);
        setListing(result.currentListing);
        setAction("");
        setCandidate(null);
        setConfirmed(false);
        setReason("");
      }
    } catch {
      setError(true);
      setCandidate(null);
      setConfirmed(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const candidateUrl = safePortalLink(candidate?.permalink ?? null);
  const confirmationLabels = {
    confirm_not_created: "absenceConfirmation",
    link: "linkConfirmation",
    retry: "confirmation",
    accept_remote: "confirmation",
    "": "confirmation",
  };

  return (
    <article aria-busy={busy} className="space-y-4 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">
        {listing.property?.name ?? t("listing")}
      </h2>
      {listing.externalId && (
        <p>{t("externalId", { id: listing.externalId })}</p>
      )}
      {overview && !enabled && <output>{t("disabled")}</output>}
      <output>{job ? t(`status.${job.status}`) : t("noOperation")}</output>
      {error && <p role="alert">{t("error")}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void execute("read")}
        >
          {busy ? t("loading") : t("read")}
        </button>
        {listing.externalId && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={
              !canWrite ||
              (!!job &&
                ["queued", "retry", "dispatching", "needs_review"].includes(
                  job.status,
                ))
            }
            onClick={() => void execute("refresh")}
          >
            {t("refresh")}
          </button>
        )}
      </div>
      {reviewable && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void execute("resolve");
          }}
        >
          <p>{t("reviewHint")}</p>
          <div>
            <label className="block" htmlFor={`resolution-${listing.id}`}>
              {t("actionLabel")}
            </label>
            <select
              id={`resolution-${listing.id}`}
              className="mt-1 block w-full rounded border p-2"
              value={action}
              disabled={!canWrite}
              onChange={(event) => {
                setAction(event.target.value as typeof action);
                setCandidate(null);
                setConfirmed(false);
              }}
            >
              <option value="">{t("choose")}</option>
              {unresolvedCreation && (
                <>
                  <option value="link">{t("action.link")}</option>
                  <option value="confirm_not_created">
                    {t("action.confirm_not_created")}
                  </option>
                </>
              )}
              {retryAllowed && (
                <option value="retry">{t("action.retry")}</option>
              )}
              {listing.externalId && (
                <option value="accept_remote">
                  {t("action.accept_remote")}
                </option>
              )}
            </select>
          </div>
          {action === "link" && (
            <div className="space-y-3">
              <label className="block">
                {t("itemId")}
                <input
                  className="mt-1 block w-full rounded border p-2"
                  value={externalId}
                  disabled={!canWrite}
                  onChange={(event) => {
                    setExternalId(event.target.value);
                    setCandidate(null);
                    setConfirmed(false);
                  }}
                  placeholder="MLA123456789"
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canWrite || !/^MLA\d+$/.test(externalId.trim())}
                onClick={() => void execute("candidate")}
              >
                {t("verify")}
              </button>
              {candidate && (
                <div className="rounded border p-3">
                  <p>{candidate.title ?? candidate.id}</p>
                  <p>{t("seller", { id: candidate.seller_id })}</p>
                  <p>
                    {t("remoteStatus", {
                      status: [
                        "active",
                        "paused",
                        "closed",
                        "under_review",
                      ].includes(candidate.status)
                        ? t(`remoteStates.${candidate.status}`)
                        : candidate.status,
                    })}
                  </p>
                  {candidateUrl && (
                    <a
                      href={candidateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {t("view")}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          {action && (
            <>
              <label className="block">
                {t("reason")}
                <textarea
                  className="mt-1 block w-full rounded border p-2"
                  value={reason}
                  minLength={10}
                  maxLength={1000}
                  required
                  disabled={!canWrite}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!canWrite}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>{t(confirmationLabels[action])}</span>
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  !canWrite ||
                  !confirmed ||
                  reason.trim().length < 10 ||
                  (action === "link" && candidate?.id !== externalId.trim())
                }
              >
                {t("resolve")}
              </button>
            </>
          )}
        </form>
      )}
      <details>
        <summary>{t("history")}</summary>
        <ul className="space-y-3 pt-3">
          {history.map((event) => (
            <li key={event.id}>
              <p>
                {t(`action.${event.action}`)} ·{" "}
                <time dateTime={event.createdAt}>
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </p>
              <p>{event.reason}</p>
            </li>
          ))}
        </ul>
        {!history.length && <p>{t("noHistory")}</p>}
      </details>
    </article>
  );
}

export function PortalPublicationReview({
  propertyId,
}: Readonly<{ propertyId: string }>) {
  const t = useTranslations("portalReview");
  const locale = useLocale();
  const [listings, setListings] = useState<PortalListing[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([portalsApi.list(propertyId), mercadoLibreApi.status()]).then(
      ([items, status]) => {
        if (active) {
          setListings(items.filter((item) => item.portal === "mercadolibre"));
          setEnabled(status.enabled);
          setBusy(false);
          setError(false);
        }
      },
      () => {
        if (active) {
          setError(true);
          setBusy(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [propertyId, attempt]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Link
        href={`/${locale}/properties/${propertyId}/portals/editor`}
        className="mr-4 inline-block underline"
      >
        {t("editor")}
      </Link>
      <Link href={`/${locale}/settings/mercadolibre`} className="underline">
        {t("connection")}
      </Link>
      {busy && <output>{t("loading")}</output>}
      {!busy && error && (
        <>
          <p role="alert">{t("error")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setBusy(true);
              setAttempt((value) => value + 1);
            }}
          >
            {t("read")}
          </button>
        </>
      )}
      {!busy && !error && (
        <>
          {!enabled && !listings.length && <p>{t("disabled")}</p>}
          {!listings.length && <p>{t("empty")}</p>}
          {listings.map((listing) => (
            <ReviewCard key={listing.id} listing={listing} />
          ))}
        </>
      )}
    </div>
  );
}
