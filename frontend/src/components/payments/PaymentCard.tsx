"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CreditNote, Payment } from "@/types/payment";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { formatMoneyByCode } from "@/lib/format-money";
import { invoicesApi, paymentsApi } from "@/lib/api/payments";
import { useLocale, useTranslations } from "next-intl";
import {
  Banknote,
  Calendar,
  CreditCard,
  Download,
  Eye,
  FileText,
  HandCoins,
  Landmark,
  ReceiptText,
  Wallet,
} from "lucide-react";

interface PaymentCardProps {
  payment: Payment;
}

const methodIcons = {
  cash: Banknote,
  bank_transfer: Landmark,
  check: FileText,
  debit_card: CreditCard,
  credit_card: CreditCard,
  digital_wallet: Wallet,
  crypto: HandCoins,
  other: HandCoins,
};

export function PaymentCard({ payment }: PaymentCardProps) {
  const t = useTranslations("payments");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [downloadingDocument, setDownloadingDocument] = useState<
    "receipt" | "invoice" | "credit_note" | null
  >(null);
  const [linkedCreditNote, setLinkedCreditNote] = useState<CreditNote | null>(
    null,
  );

  const formattedAmount = formatMoneyByCode(
    payment.amount,
    payment.currencyCode,
  );
  const formattedDate = new Date(payment.paymentDate).toLocaleDateString(
    locale,
  );
  const MethodIcon = methodIcons[payment.method] ?? HandCoins;

  useEffect(() => {
    let cancelled = false;

    const loadCreditNote = async () => {
      if (!payment.invoiceId) {
        setLinkedCreditNote(null);
        return;
      }

      try {
        const creditNotes = await invoicesApi.listCreditNotes(
          payment.invoiceId,
        );
        if (cancelled) return;
        const current =
          creditNotes.find((item) => item.paymentId === payment.id) ?? null;
        setLinkedCreditNote(current);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load credit notes for payment card", error);
          setLinkedCreditNote(null);
        }
      }
    };

    void loadCreditNote();

    return () => {
      cancelled = true;
    };
  }, [payment.id, payment.invoiceId]);

  const handleDownloadReceipt = async () => {
    if (!payment.receipt) return;
    try {
      setDownloadingDocument("receipt");
      await paymentsApi.downloadReceiptPdf(
        payment.id,
        payment.receipt.receiptNumber,
      );
    } catch (error) {
      console.error("Failed to download receipt from payments list", error);
    } finally {
      setDownloadingDocument(null);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!payment.invoiceId) return;
    try {
      setDownloadingDocument("invoice");
      await invoicesApi.downloadPdf(payment.invoiceId);
    } catch (error) {
      console.error("Failed to download invoice from payments list", error);
    } finally {
      setDownloadingDocument(null);
    }
  };

  const handleDownloadCreditNote = async () => {
    if (!linkedCreditNote) return;
    try {
      setDownloadingDocument("credit_note");
      await invoicesApi.downloadCreditNotePdf(
        linkedCreditNote.id,
        linkedCreditNote.noteNumber,
      );
    } catch (error) {
      console.error("Failed to download credit note from payments list", error);
    } finally {
      setDownloadingDocument(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center space-x-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              <MethodIcon size={18} />
            </span>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t(`method.${payment.method}`)}
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formattedAmount}
              </p>
            </div>
          </div>
          <PaymentStatusBadge status={payment.status} />
        </div>

        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center">
            <Calendar size={16} className="mr-2" />
            <span>{formattedDate}</span>
          </div>
          {payment.reference && (
            <div className="flex items-center">
              <FileText size={16} className="mr-2" />
              <span className="truncate">{payment.reference}</span>
            </div>
          )}
          {payment.receipt && (
            <div className="flex items-center text-green-600 dark:text-green-400">
              <CreditCard size={16} className="mr-2" />
              <span>{payment.receipt.receiptNumber}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${locale}/payments/${payment.id}`}
            className="btn btn-secondary btn-sm"
          >
            <Eye size={14} />
            {tCommon("view")}
          </Link>
          {payment.receipt ? (
            <button
              type="button"
              onClick={() => void handleDownloadReceipt()}
              disabled={downloadingDocument === "receipt"}
              className="btn btn-success btn-sm"
            >
              <ReceiptText size={14} />
              {downloadingDocument === "receipt"
                ? tCommon("loading")
                : t("actions.downloadReceipt")}
            </button>
          ) : null}
          {payment.invoiceId ? (
            <button
              type="button"
              onClick={() => void handleDownloadInvoice()}
              disabled={downloadingDocument === "invoice"}
              className="btn btn-primary btn-sm"
            >
              <FileText size={14} />
              {downloadingDocument === "invoice"
                ? tCommon("loading")
                : t("actions.downloadInvoice")}
            </button>
          ) : null}
          {linkedCreditNote ? (
            <button
              type="button"
              onClick={() => void handleDownloadCreditNote()}
              disabled={downloadingDocument === "credit_note"}
              className="btn btn-secondary btn-sm"
            >
              <Download size={14} />
              {downloadingDocument === "credit_note"
                ? tCommon("loading")
                : t("actions.downloadCreditNote")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
