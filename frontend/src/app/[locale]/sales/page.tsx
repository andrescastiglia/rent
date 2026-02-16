"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { salesApi } from "@/lib/api/sales";
import {
  SaleFolder,
  SaleAgreement,
  SaleReceipt,
  CreateSaleFolderInput,
  CreateSaleAgreementInput,
  CreateSaleReceiptInput,
} from "@/types/sales";
import { Download, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { CurrencySelect } from "@/components/common/CurrencySelect";

export default function SalesPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations("sales");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const tCommon = useTranslations("common");
  const tCurrencies = useTranslations("currencies");

  const [folders, setFolders] = useState<SaleFolder[]>([]);
  const [agreements, setAgreements] = useState<SaleAgreement[]>([]);
  const [receipts, setReceipts] = useState<Record<string, SaleReceipt[]>>({});
  const [loading, setLoading] = useState(true);

  const [folderForm, setFolderForm] = useState<CreateSaleFolderInput>({
    name: "",
    description: "",
  });

  const [agreementForm, setAgreementForm] = useState<CreateSaleAgreementInput>({
    folderId: "",
    buyerName: "",
    buyerPhone: "",
    totalAmount: 0,
    currency: "ARS",
    installmentAmount: 0,
    installmentCount: 1,
    startDate: new Date().toISOString().split("T")[0],
    dueDay: 10,
    notes: "",
  });

  const [receiptForm, setReceiptForm] = useState<
    Record<string, CreateSaleReceiptInput>
  >({});

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading]);

  const loadData = async () => {
    try {
      const [foldersData, agreementsData] = await Promise.all([
        salesApi.getFolders(),
        salesApi.getAgreements(),
      ]);
      setFolders(foldersData);
      setAgreements(agreementsData);
      const receiptsMap: Record<string, SaleReceipt[]> = {};
      await Promise.all(
        agreementsData.map(async (agreement) => {
          const data = await salesApi.getReceipts(agreement.id);
          receiptsMap[agreement.id] = data;
        }),
      );
      setReceipts(receiptsMap);
    } catch (error) {
      console.error("Failed to load sales data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folderForm.name.trim()) return;
    try {
      const created = await salesApi.createFolder({
        name: folderForm.name.trim(),
        description: folderForm.description?.trim() || undefined,
      });
      setFolders((prev) => [created, ...prev]);
      setFolderForm({ name: "", description: "" });
    } catch (error) {
      console.error("Failed to create folder", error);
    }
  };

  const handleCreateAgreement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agreementForm.folderId) return;
    try {
      const created = await salesApi.createAgreement({
        ...agreementForm,
        buyerName: agreementForm.buyerName.trim(),
        buyerPhone: agreementForm.buyerPhone.trim(),
        notes: agreementForm.notes?.trim() || undefined,
        currency: agreementForm.currency || "ARS",
      });
      setAgreements((prev) => [created, ...prev]);
      setAgreementForm({
        folderId: agreementForm.folderId,
        buyerName: "",
        buyerPhone: "",
        totalAmount: 0,
        currency: "ARS",
        installmentAmount: 0,
        installmentCount: 1,
        startDate: new Date().toISOString().split("T")[0],
        dueDay: 10,
        notes: "",
      });
    } catch (error) {
      console.error("Failed to create agreement", error);
    }
  };

  const handleCreateReceipt = async (agreementId: string) => {
    const form = receiptForm[agreementId];
    if (!form || !form.amount || !form.paymentDate) return;

    try {
      const created = await salesApi.createReceipt(agreementId, form);
      setReceipts((prev) => ({
        ...prev,
        [agreementId]: [created, ...(prev[agreementId] || [])],
      }));
      setReceiptForm((prev) => ({
        ...prev,
        [agreementId]: {
          amount: 0,
          paymentDate: new Date().toISOString().split("T")[0],
        },
      }));
    } catch (error) {
      console.error("Failed to create receipt", error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <form
            onSubmit={handleCreateFolder}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t("folders.new")}
            </h2>
            <input
              type="text"
              placeholder={t("folders.name")}
              value={folderForm.name}
              onChange={(e) =>
                setFolderForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
            />
            <textarea
              placeholder={t("folders.description")}
              value={folderForm.description}
              onChange={(e) =>
                setFolderForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              rows={2}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
            />
            <button type="submit" className="btn btn-primary w-full">
              {tCommon("save")}
            </button>
          </form>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              {t("folders.list")}
            </h2>
            <div className="space-y-2">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="rounded-md border border-gray-200 dark:border-gray-700 p-3"
                >
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {folder.name}
                  </p>
                  {folder.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {folder.description}
                    </p>
                  )}
                </div>
              ))}
              {folders.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("folders.empty")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <form
            onSubmit={handleCreateAgreement}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t("agreements.new")}
            </h2>
            <select
              value={agreementForm.folderId}
              onChange={(e) =>
                setAgreementForm((prev) => ({
                  ...prev,
                  folderId: e.target.value,
                }))
              }
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
            >
              <option value="">{t("agreements.selectFolder")}</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={t("agreements.buyerName")}
                value={agreementForm.buyerName}
                onChange={(e) =>
                  setAgreementForm((prev) => ({
                    ...prev,
                    buyerName: e.target.value,
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="text"
                placeholder={t("agreements.buyerPhone")}
                value={agreementForm.buyerPhone}
                onChange={(e) =>
                  setAgreementForm((prev) => ({
                    ...prev,
                    buyerPhone: e.target.value,
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("agreements.totalAmount")}
                value={agreementForm.totalAmount}
                onChange={(e) =>
                  setAgreementForm((prev) => ({
                    ...prev,
                    totalAmount: Number(e.target.value),
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("agreements.installmentAmount")}
                value={agreementForm.installmentAmount}
                onChange={(e) =>
                  setAgreementForm((prev) => ({
                    ...prev,
                    installmentAmount: Number(e.target.value),
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  {tCurrencies("title")}
                </label>
                <CurrencySelect
                  id="agreementCurrency"
                  name="agreementCurrency"
                  value={agreementForm.currency || ""}
                  onChange={(value) =>
                    setAgreementForm((prev) => ({ ...prev, currency: value }))
                  }
                />
              </div>
              <input
                type="number"
                min="1"
                placeholder={t("agreements.installmentCount")}
                value={agreementForm.installmentCount}
                onChange={(e) =>
                  setAgreementForm((prev) => ({
                    ...prev,
                    installmentCount: Number(e.target.value),
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              <input
                type="date"
                value={agreementForm.startDate}
                onChange={(e) =>
                  setAgreementForm((prev) => ({
                    ...prev,
                    startDate: e.target.value,
                  }))
                }
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full">
              {tCommon("save")}
            </button>
          </form>

          <div className="space-y-4">
            {agreements.map((agreement) => {
              const agreementReceipts = receipts[agreement.id] || [];
              const balance =
                Number(agreement.totalAmount) - Number(agreement.paidAmount);
              return (
                <div
                  key={agreement.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {agreement.buyerName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {agreement.buyerPhone}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("agreements.balance")}: {balance.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t("agreements.installments")}:{" "}
                      {agreement.installmentAmount.toLocaleString()} x{" "}
                      {agreement.installmentCount}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={t("receipts.amount")}
                      value={receiptForm[agreement.id]?.amount ?? ""}
                      onChange={(e) =>
                        setReceiptForm((prev) => ({
                          ...prev,
                          [agreement.id]: {
                            amount: Number(e.target.value),
                            paymentDate:
                              prev[agreement.id]?.paymentDate ||
                              new Date().toISOString().split("T")[0],
                          },
                        }))
                      }
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                    />
                    <input
                      type="date"
                      value={
                        receiptForm[agreement.id]?.paymentDate ||
                        new Date().toISOString().split("T")[0]
                      }
                      onChange={(e) =>
                        setReceiptForm((prev) => ({
                          ...prev,
                          [agreement.id]: {
                            amount: prev[agreement.id]?.amount || 0,
                            paymentDate: e.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleCreateReceipt(agreement.id)}
                      className="btn btn-success"
                    >
                      {t("receipts.create")}
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t("receipts.duplicate")}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {agreementReceipts.map((receipt) => (
                      <div
                        key={receipt.id}
                        className="flex flex-col md:flex-row md:items-center justify-between text-sm text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700 pt-2"
                      >
                        <span>{receipt.receiptNumber}</span>
                        <span>
                          {new Date(receipt.paymentDate).toLocaleDateString()}
                        </span>
                        <span>
                          {t("receipts.overdue")}:{" "}
                          {receipt.overdueAmount.toLocaleString()}
                        </span>
                        <span>
                          {t("receipts.balanceAfter")}:{" "}
                          {receipt.balanceAfter.toLocaleString()}
                        </span>
                        {receipt.pdfUrl && (
                          <a
                            href={`${apiUrl}/sales/receipts/${receipt.id}/pdf`}
                            className="action-link action-link-primary"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download size={14} />
                            {t("receipts.download")}
                          </a>
                        )}
                      </div>
                    ))}
                    {agreementReceipts.length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("receipts.empty")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
