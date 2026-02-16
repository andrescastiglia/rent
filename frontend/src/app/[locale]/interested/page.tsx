"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { interestedApi } from "@/lib/api/interested";
import {
  InterestedActivity,
  InterestedMatch,
  InterestedOperation,
  InterestedProfile,
  InterestedStatus,
  InterestedSummary,
} from "@/types/interested";
import { useAuth } from "@/contexts/auth-context";

const STAGE_OPTIONS: InterestedStatus[] = ["interested", "tenant", "buyer"];

const MATCH_REASON_KEY_PREFIX = "interested.matchReasons.";
const ACTIVITY_KEY_PREFIX = "interested.";
const MATCH_REASON_KEYS = [
  "propertyTypeMatches",
  "operationMatches",
  "priceWithinRange",
  "capacityAdequate",
  "petsAllowed",
  "cityMatches",
  "featuresMatch",
  "guaranteeMatches",
  "partialMatch",
] as const;
type MatchReasonKey = (typeof MATCH_REASON_KEYS)[number];

type ContractLink = {
  href: string;
  label: string;
};

type MatchCardProps = {
  match: InterestedMatch;
  selectedProfile: InterestedProfile | null;
  confirmingMatchId: string | null;
  t: (key: string) => string;
  formatMatchReason: (reason: string) => string;
  resolveMatchConfirmationAction: (
    profile: InterestedProfile,
    match: InterestedMatch,
  ) => "rent" | "sale" | null;
  resolveMatchContractLinks: (
    profile: InterestedProfile,
    match: InterestedMatch,
  ) => ContractLink[];
  onConfirm: (match: InterestedMatch) => void;
  getConfirmMatchLabel: (
    action: "rent" | "sale" | null | undefined,
    isConfirming: boolean,
  ) => string;
};

function MatchCard({
  match,
  selectedProfile,
  confirmingMatchId,
  t,
  formatMatchReason,
  resolveMatchConfirmationAction,
  resolveMatchContractLinks,
  onConfirm,
  getConfirmMatchLabel,
}: MatchCardProps) {
  const confirmationAction =
    selectedProfile && resolveMatchConfirmationAction(selectedProfile, match);
  const contractLinks = selectedProfile
    ? resolveMatchContractLinks(selectedProfile, match)
    : [];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-2 bg-white/70 dark:bg-gray-900/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {match.property?.name ?? match.propertyId}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("labels.score")}: {(match.score ?? 0).toFixed(2)}%
          </p>
        </div>
        <span className="text-xs px-2 py-1 rounded-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
          {t(`matchStatus.${match.status}`)}
        </span>
      </div>

      {match.matchReasons?.length ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {match.matchReasons.map(formatMatchReason).join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onConfirm(match)}
          disabled={!confirmationAction || confirmingMatchId === match.id}
          className="px-3 py-1.5 rounded-md border border-green-300 text-green-700 text-xs disabled:opacity-60"
        >
          {getConfirmMatchLabel(
            confirmationAction,
            confirmingMatchId === match.id,
          )}
        </button>

        {contractLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="px-3 py-1.5 rounded-md border border-blue-300 dark:border-blue-700 text-xs text-blue-700 dark:text-blue-300"
          >
            {link.label}
          </Link>
        ))}

        {match.status === "accepted" ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("matchStatus.accepted")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function getProfileOperations(
  profile: InterestedProfile,
): InterestedOperation[] {
  return (
    profile.operations ?? (profile.operation ? [profile.operation] : ["rent"])
  );
}

type ProfileExpandedDetailProps = {
  isLoading: boolean;
  summary: InterestedSummary | null;
  selectedProfile: InterestedProfile | null;
  confirmingMatchId: string | null;
  sortedActivities: InterestedActivity[];
  locale: string;
  t: (key: string) => string;
  formatMatchReason: (reason: string) => string;
  formatActivityText: (
    value?: string,
    metadata?: Record<string, unknown>,
  ) => string | undefined;
  resolveMatchConfirmationAction: (
    profile: InterestedProfile,
    match: InterestedMatch,
  ) => "rent" | "sale" | null;
  resolveMatchContractLinks: (
    profile: InterestedProfile,
    match: InterestedMatch,
  ) => ContractLink[];
  onConfirm: (match: InterestedMatch) => void;
  getConfirmMatchLabel: (
    action: "rent" | "sale" | null | undefined,
    isConfirming: boolean,
  ) => string;
};

function ProfileExpandedDetail({
  isLoading,
  summary,
  selectedProfile,
  confirmingMatchId,
  sortedActivities,
  locale,
  t,
  formatMatchReason,
  formatActivityText,
  resolveMatchConfirmationAction,
  resolveMatchContractLinks,
  onConfirm,
  getConfirmMatchLabel,
}: ProfileExpandedDetailProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-blue-200/70 dark:border-blue-900 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t("matchesTitle")}
        </h3>
      </div>

      {summary?.matches?.length ? (
        <div className="space-y-2">
          {summary.matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              selectedProfile={selectedProfile}
              confirmingMatchId={confirmingMatchId}
              t={t}
              formatMatchReason={formatMatchReason}
              resolveMatchConfirmationAction={resolveMatchConfirmationAction}
              resolveMatchContractLinks={resolveMatchContractLinks}
              onConfirm={onConfirm}
              getConfirmMatchLabel={getConfirmMatchLabel}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("noMatches")}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t("activities.title")}
        </h3>
        {sortedActivities.length > 0 ? (
          <div className="space-y-2">
            {sortedActivities.map((activity: InterestedActivity) => (
              <div
                key={activity.id}
                className="border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-white/70 dark:bg-gray-900/20"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatActivityText(activity.subject, activity.metadata)}
                  </p>
                  <span className="text-xs px-2 py-1 rounded-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {t(`activityStatus.${activity.status}`)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t(`activityTypes.${activity.type}`)} ·{" "}
                  {new Date(activity.createdAt).toLocaleString(locale)}
                </p>
                {activity.body ? (
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-wrap">
                    {formatActivityText(activity.body, activity.metadata)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("activities.empty")}
          </p>
        )}
      </div>
    </div>
  );
}

export default function InterestedPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("interested");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [profiles, setProfiles] = useState<InterestedProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [summary, setSummary] = useState<InterestedSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [operationFilter, setOperationFilter] = useState<
    "all" | InterestedOperation
  >("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InterestedStatus>(
    "all",
  );
  const [confirmingMatchId, setConfirmingMatchId] = useState<string | null>(
    null,
  );

  const statusLabel = useCallback(
    (status?: string) => t(`status.${status ?? "interested"}`),
    [t],
  );

  const formatMatchReason = useCallback(
    (reason: string): string => {
      const normalizedReason = reason.trim();
      const shortKey = normalizedReason.startsWith(MATCH_REASON_KEY_PREFIX)
        ? normalizedReason.slice(MATCH_REASON_KEY_PREFIX.length)
        : normalizedReason;

      if ((MATCH_REASON_KEYS as readonly string[]).includes(shortKey)) {
        return t(`matchReasons.${shortKey as MatchReasonKey}`);
      }

      return normalizedReason;
    },
    [t],
  );

  const formatActivityText = useCallback(
    (
      value?: string,
      metadata?: Record<string, unknown>,
    ): string | undefined => {
      if (!value) return value;

      const normalizedValue = value.trim();
      if (!normalizedValue.startsWith(ACTIVITY_KEY_PREFIX)) {
        return normalizedValue;
      }

      const translationKey = normalizedValue.slice(ACTIVITY_KEY_PREFIX.length);
      const args: Record<string, string> = {};
      if (typeof metadata?.propertyId === "string") {
        args.propertyId = metadata.propertyId;
      }
      if (typeof metadata?.tenantId === "string") {
        args.tenantId = metadata.tenantId;
      }
      if (typeof metadata?.userEmail === "string") {
        args.userEmail = metadata.userEmail;
      }

      if (
        translationKey === "activities.matchContactBody" &&
        !args.propertyId
      ) {
        args.propertyId = "-";
      }

      if (translationKey === "activities.convertedToTenantBody") {
        args.tenantId = args.tenantId ?? "-";
        args.userEmail = args.userEmail ?? "-";
      }

      try {
        return t(translationKey, args);
      } catch {
        return normalizedValue;
      }
    },
    [t],
  );

  const filteredProfiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return [...profiles]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .filter((profile) => {
        const operations = getProfileOperations(profile);

        if (
          operationFilter !== "all" &&
          !operations.includes(operationFilter)
        ) {
          return false;
        }

        if (
          statusFilter !== "all" &&
          (profile.status ?? "interested") !== statusFilter
        ) {
          return false;
        }

        if (!term) return true;

        const fullName =
          `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.toLowerCase();
        return (
          fullName.includes(term) ||
          (profile.phone ?? "").toLowerCase().includes(term) ||
          (profile.email ?? "").toLowerCase().includes(term)
        );
      });
  }, [profiles, searchTerm, operationFilter, statusFilter]);

  const selectedProfile = useMemo(() => {
    if (summary?.profile.id === selectedProfileId) {
      return summary.profile;
    }
    if (!selectedProfileId) return null;
    return profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  }, [profiles, selectedProfileId, summary?.profile]);

  const resolveMatchConfirmationAction = useCallback(
    (
      profile: InterestedProfile,
      match: InterestedMatch,
    ): "rent" | "sale" | null => {
      const profileOperations = getProfileOperations(profile);
      const propertyOperations = match.property?.operations ?? [];
      const supportsRent = propertyOperations.includes("rent");
      const supportsSale = propertyOperations.includes("sale");

      if (profileOperations.includes("rent") && supportsRent) return "rent";
      if (profileOperations.includes("sale") && supportsSale) return "sale";
      if (supportsRent) return "rent";
      if (supportsSale) return "sale";
      return null;
    },
    [],
  );

  const resolveMatchContractLinks = useCallback(
    (profile: InterestedProfile, match: InterestedMatch): ContractLink[] => {
      if (!match.propertyId) return [];

      const profileOperations = getProfileOperations(profile);
      const propertyOperations = match.property?.operations ?? [];
      const links: ContractLink[] = [];

      const baseQuery = new URLSearchParams({
        propertyId: match.propertyId,
      });

      if (match.property?.name) {
        baseQuery.set("propertyName", match.property.name);
      }
      if (propertyOperations.length > 0) {
        baseQuery.set("propertyOperations", propertyOperations.join(","));
      }

      if (
        profileOperations.includes("rent") &&
        propertyOperations.includes("rent") &&
        profile.convertedToTenantId
      ) {
        const rentQuery = new URLSearchParams(baseQuery);
        rentQuery.set("tenantId", profile.convertedToTenantId);
        rentQuery.set("contractType", "rental");
        links.push({
          href: `/${locale}/leases/new?${rentQuery.toString()}`,
          label: t("actions.newRentalContract"),
        });
      }

      if (
        profileOperations.includes("sale") &&
        propertyOperations.includes("sale")
      ) {
        const saleQuery = new URLSearchParams(baseQuery);
        saleQuery.set("buyerProfileId", profile.id);
        saleQuery.set("contractType", "sale");
        links.push({
          href: `/${locale}/leases/new?${saleQuery.toString()}`,
          label: t("actions.newSaleContract"),
        });
      }

      return links;
    },
    [locale, t],
  );

  const selectProfile = useCallback(
    async (profile: InterestedProfile) => {
      if (selectedProfileId === profile.id) {
        setSelectedProfileId(null);
        setSummary(null);
        return;
      }

      setSelectedProfileId(profile.id);
      setLoadingDetail(true);
      try {
        const summaryResult = await interestedApi.getSummary(profile.id);
        setSummary(summaryResult);
        setProfiles((prev) =>
          prev.map((item) =>
            item.id === summaryResult.profile.id
              ? { ...item, ...summaryResult.profile }
              : item,
          ),
        );
      } catch (error) {
        console.error("Failed to load interested summary", error);
        setSummary(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [selectedProfileId],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const profilesResult = await interestedApi.getAll({ limit: 100 });
      setProfiles(profilesResult.data);
    } catch (error) {
      console.error("Failed to load CRM interested data", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    loadInitial().catch((error) => {
      console.error("Failed to load CRM interested data", error);
    });
  }, [authLoading, loadInitial]);

  const handleConfirmMatch = useCallback(
    async (match: InterestedMatch) => {
      const currentProfile = summary?.profile ?? selectedProfile;
      if (!currentProfile) return;

      const action = resolveMatchConfirmationAction(currentProfile, match);
      if (!action) return;

      setConfirmingMatchId(match.id);
      try {
        if (action === "rent") {
          if (!currentProfile.convertedToTenantId) {
            await interestedApi.convertToTenant(currentProfile.id, {});
          }
        } else {
          await interestedApi.changeStage(
            currentProfile.id,
            "buyer",
            t("actions.purchaseConfirmedReason", {
              property: match.property?.name ?? match.propertyId,
            }),
          );
        }

        if (match.status !== "accepted") {
          await interestedApi.updateMatch(
            currentProfile.id,
            match.id,
            "accepted",
          );
        }

        await selectProfile(currentProfile);
      } catch (error) {
        console.error("Failed to confirm suggested property", error);
        alert(tc("error"));
      } finally {
        setConfirmingMatchId(null);
      }
    },
    [
      resolveMatchConfirmationAction,
      selectProfile,
      selectedProfile,
      summary?.profile,
      t,
      tc,
    ],
  );

  const handleSelectProfileClick = useCallback(
    (profile: InterestedProfile) => {
      selectProfile(profile).catch((error) => {
        console.error("Failed to select profile", error);
      });
    },
    [selectProfile],
  );

  const handleConfirmMatchClick = useCallback(
    (match: InterestedMatch) => {
      handleConfirmMatch(match).catch((error) => {
        console.error("Failed to confirm suggested property", error);
      });
    },
    [handleConfirmMatch],
  );

  const getConfirmMatchLabel = useCallback(
    (
      action: "rent" | "sale" | null | undefined,
      isConfirming: boolean,
    ): string => {
      if (isConfirming) return t("actions.confirming");
      return action === "sale"
        ? t("actions.confirmPurchase")
        : t("actions.confirmRent");
    },
    [t],
  );

  const sortedActivities = useMemo(() => {
    return [...(summary?.activities ?? [])].sort(
      (a, b) =>
        new Date(b.dueAt ?? b.createdAt).getTime() -
        new Date(a.dueAt ?? a.createdAt).getTime(),
    );
  }, [summary?.activities]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("listTitle")}
          </h2>
          <Link
            href={`/${locale}/interested/new`}
            className="inline-flex items-center rounded-md border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 dark:border-blue-700 dark:text-blue-300"
          >
            {t("actions.new")}
          </Link>
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={t("listSearchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-hidden focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={operationFilter}
            onChange={(e) =>
              setOperationFilter(e.target.value as "all" | InterestedOperation)
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          >
            <option value="all">{t("filters.allOperations")}</option>
            <option value="rent">{t("operations.rent")}</option>
            <option value="sale">{t("operations.sale")}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | InterestedStatus)
            }
            className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
          >
            <option value="all">{t("filters.allStages")}</option>
            {STAGE_OPTIONS.map((stage) => (
              <option key={stage} value={stage}>
                {statusLabel(stage)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredProfiles.length > 0 ? (
          <div className="space-y-3">
            {filteredProfiles.map((profile) => {
              const operations = getProfileOperations(profile);
              const isSelected = selectedProfileId === profile.id;
              const hasLoadedSummary =
                isSelected && summary?.profile.id === profile.id;

              return (
                <div
                  key={profile.id}
                  className={`rounded-lg border p-3 space-y-3 transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectProfileClick(profile)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {profile.firstName || profile.lastName
                          ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim()
                          : profile.phone}
                      </p>
                      <span className="text-xs px-2 py-1 rounded-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {statusLabel(profile.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {profile.phone}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t("operationsLabel", {
                        op: operations
                          .map((operation) => t(`operations.${operation}`))
                          .join(", "),
                      })}
                    </p>
                  </button>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/${locale}/interested/${profile.id}/edit`}
                      className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-xs"
                    >
                      {t("actions.edit")}
                    </Link>
                    <Link
                      href={`/${locale}/interested/${profile.id}/activities/new`}
                      className="px-3 py-1.5 rounded-md border border-green-300 dark:border-green-700 text-xs text-green-700 dark:text-green-300"
                    >
                      {t("activities.add")}
                    </Link>
                  </div>

                  {isSelected && (
                    <ProfileExpandedDetail
                      isLoading={loadingDetail && !hasLoadedSummary}
                      summary={summary}
                      selectedProfile={selectedProfile}
                      confirmingMatchId={confirmingMatchId}
                      sortedActivities={sortedActivities}
                      locale={locale}
                      t={t}
                      formatMatchReason={formatMatchReason}
                      formatActivityText={formatActivityText}
                      resolveMatchConfirmationAction={
                        resolveMatchConfirmationAction
                      }
                      resolveMatchContractLinks={resolveMatchContractLinks}
                      onConfirm={handleConfirmMatchClick}
                      getConfirmMatchLabel={getConfirmMatchLabel}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {profiles.length > 0 ? t("noResults") : t("empty")}
          </p>
        )}
      </div>
    </div>
  );
}
