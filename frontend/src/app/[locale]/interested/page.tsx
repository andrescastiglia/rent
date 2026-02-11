"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { interestedApi } from "@/lib/api/interested";
import {
  InterestedMatch,
  InterestedOperation,
  InterestedProfile,
  InterestedStatus,
  InterestedSummary,
} from "@/types/interested";
import { useAuth } from "@/contexts/auth-context";

const STAGE_OPTIONS: InterestedStatus[] = ["interested", "tenant", "buyer"];

const MATCH_REASON_KEY_PREFIX = "interested.matchReasons.";
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

type ContractAction = {
  href: string;
  label: string;
};

function getProfileOperations(
  profile: InterestedProfile,
): InterestedOperation[] {
  return (
    profile.operations ?? (profile.operation ? [profile.operation] : ["rent"])
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
  const [refreshingMatches, setRefreshingMatches] = useState(false);
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

  const resolveContractAction = useCallback(
    (profile: InterestedProfile): ContractAction | null => {
      const operations = getProfileOperations(profile);
      const supportsRent = operations.includes("rent");
      const supportsSale = operations.includes("sale");

      if (supportsSale && !supportsRent) {
        return {
          href: `/${locale}/leases/new?buyerProfileId=${profile.id}&contractType=sale`,
          label: t("actions.newSaleContract"),
        };
      }

      if (supportsRent && profile.convertedToTenantId) {
        return {
          href: `/${locale}/leases/new?tenantId=${profile.convertedToTenantId}&contractType=rental`,
          label: t("actions.newRentalContract"),
        };
      }

      if (supportsSale) {
        return {
          href: `/${locale}/leases/new?buyerProfileId=${profile.id}&contractType=sale`,
          label: t("actions.newSaleContract"),
        };
      }

      return null;
    },
    [locale, t],
  );

  const selectProfile = useCallback(async (profile: InterestedProfile) => {
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
  }, []);

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
    void loadInitial();
  }, [authLoading, loadInitial]);

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

  const handleRefreshMatches = useCallback(async () => {
    if (!selectedProfile) return;

    setRefreshingMatches(true);
    try {
      await interestedApi.refreshMatches(selectedProfile.id);
      await selectProfile(selectedProfile);
    } catch (error) {
      console.error("Failed to refresh matches", error);
      alert(tc("error"));
    } finally {
      setRefreshingMatches(false);
    }
  }, [selectedProfile, selectProfile, tc]);

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

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t("listTitle")}
        </h2>

        <input
          type="text"
          placeholder={t("listSearchPlaceholder")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
        />

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
              const contractAction = resolveContractAction(profile);
              const isSelected = selectedProfileId === profile.id;

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
                    onClick={() => void selectProfile(profile)}
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
                    {contractAction ? (
                      <Link
                        href={contractAction.href}
                        className="px-3 py-1.5 rounded-md border border-blue-300 dark:border-blue-700 text-xs text-blue-700 dark:text-blue-300"
                      >
                        {contractAction.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 text-xs text-gray-400 cursor-not-allowed"
                      >
                        {t("actions.newRentalContract")}
                      </button>
                    )}
                    <Link
                      href={`/${locale}/interested/${profile.id}/activities/new`}
                      className="px-3 py-1.5 rounded-md border border-green-300 dark:border-green-700 text-xs text-green-700 dark:text-green-300"
                    >
                      {t("activities.add")}
                    </Link>
                  </div>
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

      {selectedProfileId ? (
        loadingDetail ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t("matchesTitle")}
              </h3>
              <button
                type="button"
                onClick={() => void handleRefreshMatches()}
                disabled={refreshingMatches || !selectedProfile}
                className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs inline-flex items-center gap-2"
              >
                {refreshingMatches ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("actions.refreshMatches")}
              </button>
            </div>

            {summary?.matches?.length ? (
              <div className="space-y-3">
                {summary.matches.map((match) => {
                  const confirmationAction =
                    selectedProfile &&
                    resolveMatchConfirmationAction(selectedProfile, match);

                  return (
                    <div
                      key={match.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {match.property?.name ?? match.propertyId}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t("labels.score")}: {(match.score ?? 0).toFixed(2)}
                            %
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {t(`matchStatus.${match.status}`)}
                        </span>
                      </div>

                      {match.matchReasons?.length ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {match.matchReasons
                            .map(formatMatchReason)
                            .join(" · ")}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleConfirmMatch(match)}
                          disabled={
                            !confirmationAction ||
                            confirmingMatchId === match.id
                          }
                          className="px-3 py-1.5 rounded-md border border-green-300 text-green-700 text-xs disabled:opacity-60"
                        >
                          {confirmingMatchId === match.id
                            ? t("actions.confirming")
                            : confirmationAction === "sale"
                              ? t("actions.confirmPurchase")
                              : t("actions.confirmRent")}
                        </button>
                        {match.status === "accepted" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t("matchStatus.accepted")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("noMatches")}
              </p>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}
