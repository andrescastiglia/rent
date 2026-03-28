"use client";

import DOMPurify from "dompurify";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Lease, LeaseTemplateFormat } from "@/types/lease";
import { leasesApi } from "@/lib/api/leases";
import { LeaseStatusBadge } from "@/components/leases/LeaseStatusBadge";
import { ownersApi } from "@/lib/api/owners";
import { paymentsApi, tenantAccountsApi } from "@/lib/api/payments";
import type { Owner } from "@/types/owner";
import type { AccountBalance, Payment } from "@/types/payment";
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
import { formatMoneyByCode } from "@/lib/format-money";

type TranslationValues = Record<string, string | number | Date>;
type LeaseTranslator = (key: string, values?: TranslationValues) => string;

function PersonInfo({ lease }: Readonly<{ lease: Lease }>) {
  const t = useTranslations("leases");

  if (lease.contractType === "rental") {
    return (
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
    );
  }

  const buyer = lease.buyer;
  const firstName = buyer?.firstName ?? "";
  const lastName = buyer?.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  const displayName = fullName || buyer?.phone || t("unknownTenant");

  return (
    <>
      <p className="font-medium text-gray-900 dark:text-white">{displayName}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{buyer?.email}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{buyer?.phone}</p>
    </>
  );
}

function FinancialInfo({ lease }: Readonly<{ lease: Lease }>) {
  const t = useTranslations("leases");
  const locale = useLocale();

  if (lease.contractType === "rental") {
    return (
      <>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-300 flex items-center">
            <DollarSign size={16} className="mr-2" /> {t("rentAmount")}
          </span>
          <span className="font-bold text-gray-900 dark:text-white text-lg">
            ${Number(lease.rentAmount ?? 0).toLocaleString(locale)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-300 flex items-center">
            <DollarSign size={16} className="mr-2" /> {t("securityDeposit")}
          </span>
          <span className="font-medium text-gray-900 dark:text-white">
            ${lease.depositAmount.toLocaleString(locale)}
          </span>
        </div>
      </>
    );
  }

  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600 dark:text-gray-300 flex items-center">
        <DollarSign size={16} className="mr-2" /> {t("fields.fiscalValue")}
      </span>
      <span className="font-bold text-gray-900 dark:text-white text-lg">
        ${Number(lease.fiscalValue ?? 0).toLocaleString(locale)}
      </span>
    </div>
  );
}

const formatOptionalDate = (
  value: string | undefined,
  locale: string,
): string => (value ? new Date(value).toLocaleDateString(locale) : "-");

const getOwnerDisplayName = (owner: Owner | null): string =>
  owner
    ? `${owner.firstName} ${owner.lastName}`.trim()
    : "Sin locador/propietario";

function getPrimaryPartyName(lease: Lease, t: (key: string) => string): string {
  if (lease.contractType === "rental") {
    return (
      `${lease.tenant?.firstName ?? ""} ${lease.tenant?.lastName ?? ""}`.trim() ||
      t("unknownTenant")
    );
  }
  return (
    `${lease.buyer?.firstName ?? ""} ${lease.buyer?.lastName ?? ""}`.trim() ||
    t("unknownTenant")
  );
}

function getPrimaryPartyContact(lease: Lease): string {
  if (lease.contractType === "rental") {
    return lease.tenant?.phone || lease.tenant?.email || "-";
  }
  return lease.buyer?.phone || lease.buyer?.email || "-";
}

function getCollectionsHeadline({
  balanceInfo,
  lease,
  loadingCollections,
  locale,
}: {
  balanceInfo: AccountBalance | null;
  lease: Lease;
  loadingCollections: boolean;
  locale: string;
}): string {
  if (loadingCollections) {
    return "Cargando...";
  }
  if (lease.contractType === "rental" && balanceInfo) {
    return formatMoneyByCode(balanceInfo.total, lease.currency, locale);
  }
  if (lease.contractType === "sale") {
    return formatMoneyByCode(
      Number(lease.fiscalValue ?? 0),
      lease.currency,
      locale,
    );
  }
  return "-";
}

function getCollectionsSubtitle({
  lastPayment,
  lease,
  locale,
}: {
  lastPayment?: Payment;
  lease: Lease;
  locale: string;
}): string {
  if (lease.contractType !== "rental") {
    return "Seguimiento comercial del acuerdo";
  }
  if (!lastPayment) {
    return "Sin pagos registrados";
  }
  return `Ultimo pago: ${new Date(lastPayment.paymentDate).toLocaleDateString(locale)}`;
}

function LeaseHeader({
  lease,
  locale,
  onDelete,
  t,
  tCommon,
}: Readonly<{
  lease: Lease;
  locale: string;
  onDelete: () => void;
  t: LeaseTranslator;
  tCommon: (key: string) => string;
}>) {
  const editLabel =
    lease.status === "DRAFT" ? tCommon("edit") : t("createNewVersion");

  return (
    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 border-b dark:border-gray-700 pb-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("leaseAgreement")}
          </h1>
          <LeaseStatusBadge status={lease.status} />
        </div>
        <p className="text-gray-500 dark:text-gray-400">
          {t("versionLabel", { version: lease.versionNumber ?? 1 })}
        </p>
      </div>
      <div className="flex space-x-2">
        {lease.contractType === "rental" ? (
          <Link
            href={`/${locale}/payments/new?leaseId=${lease.id}`}
            className="btn btn-primary"
          >
            Registrar pago
          </Link>
        ) : null}
        <Link
          href={`/${locale}/leases/${lease.id}/edit`}
          className="btn btn-secondary"
        >
          <Edit size={16} className="mr-2" />
          {editLabel}
        </Link>
        <button onClick={onDelete} className="btn btn-danger">
          <Trash2 size={16} className="mr-2" />
          {tCommon("delete")}
        </button>
      </div>
    </div>
  );
}

function LeaseOverviewCards({
  balanceInfo,
  lastPayment,
  lease,
  loadingCollections,
  locale,
  ownerDisplayName,
  owner,
  t,
}: Readonly<{
  balanceInfo: AccountBalance | null;
  lastPayment?: Payment;
  lease: Lease;
  loadingCollections: boolean;
  locale: string;
  owner: Owner | null;
  ownerDisplayName: string;
  t: LeaseTranslator;
}>) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 xl:grid-cols-4">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Persona principal
        </p>
        <p className="mt-2 font-semibold text-slate-900 dark:text-white">
          {getPrimaryPartyName(lease, t as (key: string) => string)}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {getPrimaryPartyContact(lease)}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Propietario / vendedor
        </p>
        <p className="mt-2 font-semibold text-slate-900 dark:text-white">
          {ownerDisplayName}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {owner?.phone || owner?.email || "-"}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Propiedad y fechas
        </p>
        <p className="mt-2 font-semibold text-slate-900 dark:text-white">
          {lease.property?.name || t("unknownProperty")}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {formatOptionalDate(lease.startDate, locale)} a{" "}
          {formatOptionalDate(lease.endDate, locale)}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Cobranza
        </p>
        <p className="mt-2 font-semibold text-slate-900 dark:text-white">
          {getCollectionsHeadline({
            balanceInfo,
            lease,
            loadingCollections,
            locale,
          })}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {getCollectionsSubtitle({ lastPayment, lease, locale })}
        </p>
      </section>
    </div>
  );
}

function DraftEditor({
  draftText,
  editorRef,
  onDraftInput,
  onDraftTextChange,
}: Readonly<{
  draftText: string;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onDraftInput: (event: React.SyntheticEvent<HTMLDivElement>) => void;
  onDraftTextChange: (value: string) => void;
}>) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        El formato enriquecido se conserva al editar este borrador.
      </p>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={onDraftInput}
        className="min-h-[360px] rounded-md border border-gray-300 bg-white p-3 text-sm text-slate-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      />
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Vista previa HTML
        </p>
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(draftText || "<p></p>"),
          }}
        />
      </div>
      <textarea
        rows={4}
        value={draftText}
        onChange={(event) => onDraftTextChange(event.target.value)}
        className="w-full rounded-md border border-dashed border-gray-300 bg-white p-2 text-xs text-slate-600 dark:border-gray-600 dark:bg-gray-800 dark:text-slate-300"
      />
    </div>
  );
}

function DraftActions({
  confirmingDraft,
  onConfirmDraft,
  onRenderDraft,
  onSaveDraftText,
  renderingDraft,
  savingDraftText,
  t,
  tCommon,
}: Readonly<{
  confirmingDraft: boolean;
  onConfirmDraft: () => void;
  onRenderDraft: () => void;
  onSaveDraftText: () => void;
  renderingDraft: boolean;
  savingDraftText: boolean;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}>) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onRenderDraft}
        disabled={renderingDraft}
        className="btn btn-secondary"
      >
        {renderingDraft ? tCommon("loading") : t("draft.renderFromTemplate")}
      </button>
      <button
        type="button"
        onClick={onSaveDraftText}
        disabled={savingDraftText}
        className="btn btn-ghost"
      >
        {savingDraftText ? tCommon("saving") : t("draft.saveDraft")}
      </button>
      <button
        type="button"
        onClick={onConfirmDraft}
        disabled={confirmingDraft}
        className="btn btn-success"
      >
        {confirmingDraft ? tCommon("saving") : t("draft.confirm")}
      </button>
    </div>
  );
}

function ConfirmedContractView({
  confirmedFormat,
  lease,
  t,
}: Readonly<{
  confirmedFormat: LeaseTemplateFormat;
  lease: Lease;
  t: (key: string) => string;
}>) {
  if (confirmedFormat === "html") {
    return (
      <div
        className="prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-300"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(
            lease.confirmedContractText || lease.draftContractText || "<p></p>",
          ),
        }}
      />
    );
  }

  return (
    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
      {lease.confirmedContractText ||
        lease.draftContractText ||
        t("draft.empty")}
    </p>
  );
}

function DraftSection({
  confirmedFormat,
  confirmingDraft,
  draftFormat,
  draftText,
  editorRef,
  lease,
  onConfirmDraft,
  onDraftInput,
  onDraftTextChange,
  onRenderDraft,
  onSaveDraftText,
  renderingDraft,
  savingDraftText,
  t,
  tCommon,
}: Readonly<{
  confirmedFormat: LeaseTemplateFormat;
  confirmingDraft: boolean;
  draftFormat: LeaseTemplateFormat;
  draftText: string;
  editorRef: React.RefObject<HTMLDivElement | null>;
  lease: Lease;
  onConfirmDraft: () => void;
  onDraftInput: (event: React.SyntheticEvent<HTMLDivElement>) => void;
  onDraftTextChange: (value: string) => void;
  onRenderDraft: () => void;
  onSaveDraftText: () => void;
  renderingDraft: boolean;
  savingDraftText: boolean;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}>) {
  const title =
    lease.status === "DRAFT" ? t("draft.title") : t("confirmedTextTitle");

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {title}
      </h2>
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("templateInUse")}: {lease.templateName || t("templates.none")}
        </p>
        {lease.status === "DRAFT" ? (
          <>
            {draftFormat === "html" ? (
              <DraftEditor
                draftText={draftText}
                editorRef={editorRef}
                onDraftInput={onDraftInput}
                onDraftTextChange={onDraftTextChange}
              />
            ) : (
              <textarea
                rows={14}
                value={draftText}
                onChange={(event) => onDraftTextChange(event.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
              />
            )}
            <DraftActions
              confirmingDraft={confirmingDraft}
              onConfirmDraft={onConfirmDraft}
              onRenderDraft={onRenderDraft}
              onSaveDraftText={onSaveDraftText}
              renderingDraft={renderingDraft}
              savingDraftText={savingDraftText}
              t={t}
              tCommon={tCommon}
            />
          </>
        ) : (
          <ConfirmedContractView
            confirmedFormat={confirmedFormat}
            lease={lease}
            t={t}
          />
        )}
      </div>
    </section>
  );
}

function PropertyAndPartySection({
  lease,
  t,
}: Readonly<{
  lease: Lease;
  t: (key: string) => string;
}>) {
  return (
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
            {lease.property?.address ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {lease.property.address.street} {lease.property.address.number},{" "}
                {lease.property.address.city}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-start border-t border-gray-200 dark:border-gray-600 pt-4">
          <User size={18} className="text-gray-400 mr-3 mt-1" />
          <div>
            <PersonInfo lease={lease} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TermsSection({
  lease,
  t,
}: Readonly<{
  lease: Lease;
  t: (key: string) => string;
}>) {
  return (
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
  );
}

function LeaseFinancialSidebar({
  balanceInfo,
  lease,
  locale,
  t,
}: Readonly<{
  balanceInfo: AccountBalance | null;
  lease: Lease;
  locale: string;
  t: (key: string) => string;
}>) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {t("financialDetails")}
      </h2>
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
        <FinancialInfo lease={lease} />
        {lease.contractType === "rental" && balanceInfo ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-300">
                Saldo actual
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatMoneyByCode(balanceInfo.balance, lease.currency, locale)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-300">Mora</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatMoneyByCode(balanceInfo.lateFee, lease.currency, locale)}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function LeaseDurationSection({
  lease,
  locale,
  t,
}: Readonly<{
  lease: Lease;
  locale: string;
  t: (key: string) => string;
}>) {
  if (lease.contractType !== "rental") {
    return null;
  }

  return (
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
            {formatOptionalDate(lease.startDate, locale)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 dark:text-gray-300 flex items-center">
            <Calendar size={16} className="mr-2" /> {t("endDate")}
          </span>
          <span className="font-medium text-gray-900 dark:text-white">
            {formatOptionalDate(lease.endDate, locale)}
          </span>
        </div>
      </div>
    </section>
  );
}

function LeaseDocumentsSection({
  downloadingContract,
  lease,
  onDownloadContract,
  t,
}: Readonly<{
  downloadingContract: boolean;
  lease: Lease;
  onDownloadContract: () => void;
  t: (key: string) => string;
}>) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {t("documents")}
      </h2>
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
        {lease.documents.length > 0 ? (
          <ul className="space-y-2">
            {lease.documents.map((doc, index) => (
              <li key={doc}>
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
              onClick={onDownloadContract}
              disabled={downloadingContract}
              className="btn btn-primary btn-sm"
            >
              <Download size={14} className="mr-1" /> {t("downloadContract")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function RecentPaymentsSection({
  lease,
  locale,
  paymentHistory,
}: Readonly<{
  lease: Lease;
  locale: string;
  paymentHistory: Payment[];
}>) {
  if (lease.contractType !== "rental") {
    return null;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Cobros recientes
      </h2>
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
        {paymentHistory.length > 0 ? (
          paymentHistory.slice(0, 5).map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between rounded-md bg-white px-3 py-2 dark:bg-gray-800"
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {new Date(payment.paymentDate).toLocaleDateString(locale)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {payment.reference || payment.method}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatMoneyByCode(
                    payment.amount,
                    payment.currencyCode,
                    locale,
                  )}
                </p>
                <Link
                  href={`/${locale}/payments/${payment.id}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Ver pago
                </Link>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay pagos registrados para este contrato.
          </p>
        )}
      </div>
    </section>
  );
}

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
  const [owner, setOwner] = useState<Owner | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [balanceInfo, setBalanceInfo] = useState<AccountBalance | null>(null);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [downloadingContract, setDownloadingContract] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [renderingDraft, setRenderingDraft] = useState(false);
  const [savingDraftText, setSavingDraftText] = useState(false);
  const [confirmingDraft, setConfirmingDraft] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (leaseId) {
      loadLease(leaseId).catch((error) => {
        console.error("Failed to load lease", error);
      });
    }
  }, [leaseId, authLoading]);

  useEffect(() => {
    if (!lease?.ownerId) {
      setOwner(null);
      return;
    }

    ownersApi
      .getById(lease.ownerId)
      .then((data) => setOwner(data ?? null))
      .catch((error) => {
        console.error("Failed to load owner", error);
        setOwner(null);
      });
  }, [lease?.ownerId]);

  useEffect(() => {
    if (lease?.contractType !== "rental") {
      setPaymentHistory([]);
      setBalanceInfo(null);
      return;
    }

    const loadCollections = async () => {
      try {
        setLoadingCollections(true);
        const [paymentsResult, accountResult] = await Promise.all([
          paymentsApi.getAll({ leaseId: lease.id, limit: 50 }),
          tenantAccountsApi.getByLease(lease.id),
        ]);

        setPaymentHistory(paymentsResult.data);

        if (accountResult) {
          const balance = await tenantAccountsApi.getBalance(accountResult.id);
          setBalanceInfo(balance);
        } else {
          setBalanceInfo(null);
        }
      } catch (error) {
        console.error("Failed to load lease collections", error);
        setPaymentHistory([]);
        setBalanceInfo(null);
      } finally {
        setLoadingCollections(false);
      }
    };

    void loadCollections();
  }, [lease]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if ((lease?.draftContractFormat ?? "plain_text") !== "html") {
      return;
    }

    if (editorRef.current.innerHTML !== draftText) {
      editorRef.current.innerHTML = draftText || "<p></p>";
    }
  }, [draftText, lease?.draftContractFormat]);

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
      const updated = await leasesApi.updateDraftText(
        lease.id,
        draftText,
        lease.draftContractFormat ?? "plain_text",
      );
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
      const updated = await leasesApi.confirmDraft(
        lease.id,
        draftText,
        lease.draftContractFormat ?? "plain_text",
      );
      setLease(updated);
      setDraftText(updated.draftContractText ?? "");
    } catch (error) {
      console.error("Failed to confirm draft", error);
      alert(tCommon("error"));
    } finally {
      setConfirmingDraft(false);
    }
  };

  const ownerDisplayName = getOwnerDisplayName(owner);
  const lastPayment = paymentHistory[0];
  const draftFormat: LeaseTemplateFormat =
    lease?.draftContractFormat ?? "plain_text";
  const confirmedFormat: LeaseTemplateFormat =
    lease?.confirmedContractFormat ??
    lease?.draftContractFormat ??
    "plain_text";
  const handleDraftInput = (event: React.SyntheticEvent<HTMLDivElement>) => {
    setDraftText(event.currentTarget.innerHTML);
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
          <LeaseHeader
            lease={lease}
            locale={locale}
            onDelete={() => {
              void handleDelete();
            }}
            t={t}
            tCommon={tCommon as (key: string) => string}
          />

          <LeaseOverviewCards
            balanceInfo={balanceInfo}
            lastPayment={lastPayment}
            lease={lease}
            loadingCollections={loadingCollections}
            locale={locale}
            owner={owner}
            ownerDisplayName={ownerDisplayName}
            t={t}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <PropertyAndPartySection
                lease={lease}
                t={t as (key: string) => string}
              />

              <DraftSection
                confirmedFormat={confirmedFormat}
                confirmingDraft={confirmingDraft}
                draftFormat={draftFormat}
                draftText={draftText}
                editorRef={editorRef}
                lease={lease}
                onConfirmDraft={() => {
                  void handleConfirmDraft();
                }}
                onDraftInput={handleDraftInput}
                onDraftTextChange={setDraftText}
                onRenderDraft={() => {
                  void handleRenderDraft();
                }}
                onSaveDraftText={() => {
                  void handleSaveDraftText();
                }}
                renderingDraft={renderingDraft}
                savingDraftText={savingDraftText}
                t={t as (key: string) => string}
                tCommon={tCommon as (key: string) => string}
              />

              <TermsSection lease={lease} t={t as (key: string) => string} />
            </div>

            <div className="space-y-6">
              <LeaseFinancialSidebar
                balanceInfo={balanceInfo}
                lease={lease}
                locale={locale}
                t={t as (key: string) => string}
              />

              <LeaseDurationSection
                lease={lease}
                locale={locale}
                t={t as (key: string) => string}
              />

              <LeaseDocumentsSection
                downloadingContract={downloadingContract}
                lease={lease}
                onDownloadContract={() => {
                  void handleDownloadContract();
                }}
                t={t as (key: string) => string}
              />

              <RecentPaymentsSection
                lease={lease}
                locale={locale}
                paymentHistory={paymentHistory}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
