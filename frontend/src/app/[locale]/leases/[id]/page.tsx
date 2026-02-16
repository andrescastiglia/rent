"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Lease } from "@/types/lease";
import { leasesApi } from "@/lib/api/leases";
import { LeaseStatusBadge } from "@/components/leases/LeaseStatusBadge";
import {
  Edit,
  ArrowLeft,
  FileText,
  Trash2,
  Loader2,
  Calendar,
  DollarSign,
  User,
  Home,
  Download,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { useAuth } from "@/contexts/auth-context";

export default function LeaseDetailPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("leases");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const params = useParams();
  const leaseId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useLocalizedRouter();
  const [lease, setLease] = useState<Lease | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingContract, setDownloadingContract] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [renderingDraft, setRenderingDraft] = useState(false);
  const [savingDraftText, setSavingDraftText] = useState(false);
  const [confirmingDraft, setConfirmingDraft] = useState(false);

  const getBuyerDisplayName = (): string => {
    if (!lease?.buyerProfile) {
      return t("unknownTenant");
    }

    const firstName = lease.buyerProfile.firstName ?? "";
    const lastName = lease.buyerProfile.lastName ?? "";
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || lease.buyerProfile.phone;
  };

  const getLeaseDocumentKey = (documentUrl: string): string => documentUrl;

  useEffect(() => {
    if (authLoading) return;
    if (leaseId) {
      loadLease(leaseId).catch((error) => {
        console.error("Failed to load lease", error);
      });
    }
  }, [leaseId, authLoading]);

  const loadLease = async (id: string) => {
    try {
      const data = await leasesApi.getById(id);
      setLease(data);
      setDraftText(data?.draftContractText ?? "");
    } catch (error) {
      console.error("Failed to load lease", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!lease || !confirm(t("confirmDelete"))) return;

    try {
      await leasesApi.delete(lease.id);
      router.push("/leases");
    } catch (error) {
      console.error("Failed to delete lease", error);
      alert(tCommon("error"));
    }
  };

  const handleDownloadContract = async () => {
    if (!lease) return;
    setDownloadingContract(true);
    try {
      await leasesApi.downloadContract(lease.id);
    } catch (error) {
      console.error("Failed to download contract", error);
      alert(tCommon("error"));
    } finally {
      setDownloadingContract(false);
    }
  };

  const handleRenderDraft = async () => {
    if (!lease) return;
    if (!lease.templateId) {
      alert(t("templates.requiredForDraft"));
      return;
    }
    try {
      setRenderingDraft(true);
      const updated = await leasesApi.renderDraft(lease.id, lease.templateId);
      setLease(updated);
      setDraftText(updated.draftContractText ?? "");
    } catch (error) {
      console.error("Failed to render draft", error);
      alert(tCommon("error"));
    } finally {
      setRenderingDraft(false);
    }
  };

  const handleSaveDraftText = async () => {
    if (!lease) return;
    try {
      setSavingDraftText(true);
      const updated = await leasesApi.updateDraftText(lease.id, draftText);
      setLease(updated);
    } catch (error) {
      console.error("Failed to save draft text", error);
      alert(tCommon("error"));
    } finally {
      setSavingDraftText(false);
    }
  };

  const handleConfirmDraft = async () => {
    if (!lease) return;
    try {
      setConfirmingDraft(true);
      const updated = await leasesApi.confirmDraft(lease.id, draftText);
      setLease(updated);
      setDraftText(updated.draftContractText ?? "");
    } catch (error) {
      console.error("Failed to confirm draft", error);
      alert(tCommon("error"));
    } finally {
      setConfirmingDraft(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("notFound")}
        </h1>
        <Link
          href={`/${locale}/leases`}
          className="text-blue-600 hover:underline mt-4 inline-block"
        >
          {t("backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/leases`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          {t("backToList")}
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 border-b dark:border-gray-700 pb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {t("leaseAgreement")}
                </h1>
                <LeaseStatusBadge status={lease.status} />
              </div>
              <p className="text-gray-500 dark:text-gray-400">
                {tCommon("id")}: {lease.id} ·{" "}
                {t("versionLabel", { version: lease.versionNumber ?? 1 })}
              </p>
            </div>
            <div className="flex space-x-2">
              <Link
                href={`/${locale}/leases/${lease.id}/edit`}
                className="btn btn-secondary"
              >
                <Edit size={16} className="mr-2" />
                {lease.status === "DRAFT"
                  ? tCommon("edit")
                  : t("createNewVersion")}
              </Link>
              <button onClick={handleDelete} className="btn btn-danger">
                <Trash2 size={16} className="mr-2" />
                {tCommon("delete")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t("propertyAndTenant")}
                </h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
                  <div className="flex items-start">
                    <Home size={18} className="text-gray-400 mr-3 mt-1" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {lease.property?.name || t("unknownProperty")}
                      </p>
                      {lease.property?.address && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {lease.property.address.street}{" "}
                          {lease.property.address.number},{" "}
                          {lease.property.address.city}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start border-t border-gray-200 dark:border-gray-600 pt-4">
                    <User size={18} className="text-gray-400 mr-3 mt-1" />
                    <div>
                      {lease.contractType === "rental" ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {lease.tenant
                              ? `${lease.tenant.firstName} ${lease.tenant.lastName}`
                              : t("unknownTenant")}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {lease.tenant?.email}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {lease.tenant?.phone}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {getBuyerDisplayName()}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {lease.buyerProfile?.email}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {lease.buyerProfile?.phone}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {lease.status === "DRAFT"
                    ? t("draft.title")
                    : t("confirmedTextTitle")}
                </h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("templateInUse")}:{" "}
                    {lease.templateName || t("templates.none")}
                  </p>
                  {lease.status === "DRAFT" ? (
                    <>
                      <textarea
                        rows={14}
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleRenderDraft().catch((error) => {
                              console.error("Failed to render draft", error);
                            });
                          }}
                          disabled={renderingDraft}
                          className="btn btn-secondary"
                        >
                          {renderingDraft
                            ? tCommon("loading")
                            : t("draft.renderFromTemplate")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSaveDraftText().catch((error) => {
                              console.error("Failed to save draft text", error);
                            });
                          }}
                          disabled={savingDraftText}
                          className="btn btn-ghost"
                        >
                          {savingDraftText
                            ? tCommon("saving")
                            : t("draft.saveDraft")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleConfirmDraft().catch((error) => {
                              console.error("Failed to confirm draft", error);
                            });
                          }}
                          disabled={confirmingDraft}
                          className="btn btn-success"
                        >
                          {confirmingDraft
                            ? tCommon("saving")
                            : t("draft.confirm")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {lease.confirmedContractText ||
                        lease.draftContractText ||
                        t("draft.empty")}
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t("termsAndConditions")}
                </h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {lease.terms || t("noTerms")}
                  </p>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t("financialDetails")}
                </h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                  {lease.contractType === "rental" ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-300 flex items-center">
                          <DollarSign size={16} className="mr-2" />{" "}
                          {t("rentAmount")}
                        </span>
                        <span className="font-bold text-gray-900 dark:text-white text-lg">
                          $
                          {Number(lease.rentAmount ?? 0).toLocaleString(locale)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-300 flex items-center">
                          <DollarSign size={16} className="mr-2" />{" "}
                          {t("securityDeposit")}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          ${lease.depositAmount.toLocaleString(locale)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-300 flex items-center">
                        <DollarSign size={16} className="mr-2" />{" "}
                        {t("fields.fiscalValue")}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white text-lg">
                        ${Number(lease.fiscalValue ?? 0).toLocaleString(locale)}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {lease.contractType === "rental" && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    {t("duration")}
                  </h2>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-300 flex items-center">
                        <Calendar size={16} className="mr-2" /> {t("startDate")}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {lease.startDate
                          ? new Date(lease.startDate).toLocaleDateString(locale)
                          : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-300 flex items-center">
                        <Calendar size={16} className="mr-2" /> {t("endDate")}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {lease.endDate
                          ? new Date(lease.endDate).toLocaleDateString(locale)
                          : "-"}
                      </span>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t("documents")}
                </h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  {lease.documents.length > 0 ? (
                    <ul className="space-y-2">
                      {lease.documents.map((doc, index) => (
                        <li key={getLeaseDocumentKey(doc)}>
                          <a
                            href={doc}
                            className="flex items-center text-blue-600 hover:underline"
                          >
                            <FileText size={16} className="mr-2" />
                            {t("document")} {index + 1}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                      <p className="text-sm italic mb-2">{t("noDocuments")}</p>
                      <button
                        type="button"
                        onClick={handleDownloadContract}
                        disabled={downloadingContract}
                        className="btn btn-primary btn-sm"
                      >
                        <Download size={14} className="mr-1" />{" "}
                        {t("downloadContract")}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
