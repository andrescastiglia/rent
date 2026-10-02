"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Send, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  CommunicationDelivery,
  CommunicationEvent,
  CommunicationRecipientRole,
  CommunicationTemplate,
  CommunicationTemplateInput,
  communicationsApi,
} from "@/lib/api/communications";

const EVENTS: CommunicationEvent[] = [
  "payment_received",
  "invoice_issued",
  "payment_reminder",
  "invoice_overdue",
  "rent_adjustment",
  "settlement_available",
  "settlement_paid",
  "settlement_reversed",
  "office_prospect_welcome_rent",
  "office_prospect_welcome_sale",
  "property_visit_scheduled",
  "property_visit_completed",
  "property_visit_offer",
];

const EMPTY_TEMPLATE: CommunicationTemplateInput = {
  name: "",
  event: "payment_received",
  recipientRole: "tenant",
  channel: "whatsapp",
  locale: "es",
  subject: "",
  body: "Hola {{nombre}}, registramos el evento {{evento}}.",
  isActive: true,
  autoSend: true,
  requiresApproval: false,
  variables: ["nombre", "evento"],
};

const SAMPLE_VARIABLES = {
  nombre: "Cliente de prueba",
  evento: "pago recibido",
  nombre_interesado: "Ana Pérez",
  propiedad: "Propiedad de ejemplo",
  fecha_visita: "10/08/2026",
  hora_visita: "15:00",
  resultado: "interesado",
  motivo: "Solicitó una segunda visita",
  link_visita: "https://example.com/visita",
};

export default function CommunicationsSettingsPage() {
  const locale = useLocale();
  const t = useTranslations("communicationsSettings");
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [deliveries, setDeliveries] = useState<CommunicationDelivery[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CommunicationTemplateInput>({
    ...EMPTY_TEMPLATE,
    locale,
    body: t("defaultBody", { name: "{{nombre}}", event: "{{evento}}" }),
  });
  const [preview, setPreview] = useState<string>("");
  const [testRecipient, setTestRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const notice = (text: string, error = false) => {
    setMessage(text);
    setMessageError(error);
  };

  const load = useCallback(async () => {
    const [templateData, deliveryData] = await Promise.all([
      communicationsApi.listTemplates(),
      communicationsApi.listDeliveries(),
    ]);
    setTemplates(templateData);
    setDeliveries(deliveryData);
  }, []);

  useEffect(() => {
    load()
      .catch((error) => {
        console.error("Failed to load communication settings", error);
        setMessage(t("loadError"));
        setMessageError(true);
      })
      .finally(() => setLoading(false));
  }, [load, t]);

  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId),
    [selectedId, templates],
  );

  const selectTemplate = (template: CommunicationTemplate | null) => {
    setSelectedId(template?.id ?? null);
    setForm(
      template
        ? { ...template }
        : {
            ...EMPTY_TEMPLATE,
            locale,
            body: t("defaultBody", { name: "{{nombre}}", event: "{{evento}}" }),
          },
    );
    setPreview("");
    setMessage(null);
  };

  const save = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const variables = Array.from(
        form.body.matchAll(/{{\s*([A-Za-z0-9_.]+)\s*}}/g),
      ).map((match) => match[1]);
      const payload = { ...form, variables: Array.from(new Set(variables)) };
      const saved = selectedId
        ? await communicationsApi.updateTemplate(selectedId, payload)
        : await communicationsApi.createTemplate(payload);
      await load();
      selectTemplate(saved);
      notice(t("saved"));
    } catch (error) {
      console.error("Failed to save communication template", error);
      notice(t("saveError"), true);
    } finally {
      setSaving(false);
    }
  };

  const showPreview = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await communicationsApi.preview({
        subject: form.subject ?? undefined,
        body: form.body,
        variables: SAMPLE_VARIABLES,
      });
      setPreview(
        [
          result.subject,
          result.body,
          result.missingVariables.length
            ? t("missingVariables", {
                variables: result.missingVariables.join(", "),
              })
            : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    } catch {
      notice(t("previewError"), true);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!testRecipient.trim()) {
      notice(t("recipientRequired"), true);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const delivery = await communicationsApi.sendTest({
        subject: form.subject ?? undefined,
        body: form.body,
        variables: SAMPLE_VARIABLES,
        channel: form.channel,
        recipient: testRecipient.trim(),
      });
      notice(t("testRegistered", { status: t(`statuses.${delivery.status}`) }));
      await load();
    } catch {
      notice(t("sendError"), true);
    } finally {
      setBusy(false);
    }
  };

  const deliveryAction = async (delivery: CommunicationDelivery) => {
    if (busy) return;
    setBusy(true);
    try {
      if (delivery.status === "failed")
        await communicationsApi.retry(delivery.id);
      if (delivery.status === "pending_approval") {
        await communicationsApi.approve(delivery.id);
      }
      await load();
    } catch {
      notice(t("actionError"), true);
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    try {
      await load();
      setMessage(null);
    } catch {
      notice(t("loadError"), true);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${locale}/settings`}
          className="inline-flex items-center gap-1 text-gray-500"
        >
          <ArrowLeft size={16} /> {t("back")}
        </Link>
      </div>

      {message ? (
        <output
          role={messageError ? "alert" : undefined}
          className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
        >
          {message}
          {messageError && (
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => void reload()}
            >
              {t("retry")}
            </button>
          )}
        </output>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2 rounded-lg border p-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => selectTemplate(null)}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-white"
          >
            {t("new")}
          </button>
          {templates.map((template) => (
            <button
              type="button"
              key={template.id}
              onClick={() => selectTemplate(template)}
              className={`w-full rounded-md border p-3 text-left text-sm dark:border-gray-700 ${selected?.id === template.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : ""}`}
            >
              <span className="block font-medium">{template.name}</span>
              <span className="text-xs text-gray-500">
                {t(`events.${template.event}`)} ·{" "}
                {t(`roles.${template.recipientRole}`)} · {template.channel}
              </span>
            </button>
          ))}
        </aside>

        <form
          onSubmit={save}
          className="space-y-4 rounded-lg border p-5 dark:border-gray-700"
        >
          <input
            aria-label={t("name")}
            required
            value={form.name}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, name: event.target.value }))
            }
            className="w-full rounded-md border p-2 dark:bg-gray-800"
            placeholder={t("namePlaceholder")}
          />
          <div className="grid gap-3 md:grid-cols-4">
            <select
              aria-label={t("event")}
              value={form.event}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  event: event.target.value as CommunicationEvent,
                }))
              }
              className="rounded-md border p-2 dark:bg-gray-800"
            >
              {EVENTS.map((event) => (
                <option key={event} value={event}>
                  {t(`events.${event}`)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("role")}
              value={form.recipientRole}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  recipientRole: event.target
                    .value as CommunicationRecipientRole,
                }))
              }
              className="rounded-md border p-2 dark:bg-gray-800"
            >
              <option value="tenant">{t("roles.tenant")}</option>
              <option value="owner">{t("roles.owner")}</option>
              <option value="interested">{t("roles.interested")}</option>
            </select>
            <div className="rounded-md border p-2 dark:bg-gray-800">
              {t("channelHelp")}
            </div>
            <input
              aria-label={t("language")}
              value={form.locale}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  locale: event.target.value,
                }))
              }
              className="rounded-md border p-2 dark:bg-gray-800"
            />
          </div>
          <input
            aria-label={t("subject")}
            value={form.subject ?? ""}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                subject: event.target.value,
              }))
            }
            className="w-full rounded-md border p-2 dark:bg-gray-800"
            placeholder={t("subjectPlaceholder")}
          />
          <textarea
            aria-label={t("body")}
            required
            rows={7}
            value={form.body}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, body: event.target.value }))
            }
            className="w-full rounded-md border p-2 font-mono text-sm dark:bg-gray-800"
          />
          <div className="flex flex-wrap gap-4 text-sm">
            <label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    isActive: event.target.checked,
                  }))
                }
              />{" "}
              {t("active")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.autoSend}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    autoSend: event.target.checked,
                  }))
                }
              />{" "}
              {t("autoSend")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    requiresApproval: event.target.checked,
                  }))
                }
              />{" "}
              {t("requiresApproval")}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || busy}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white"
            >
              <Save size={16} /> {saving ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              disabled={busy || saving}
              onClick={() => void showPreview()}
              className="rounded-md border px-4 py-2"
            >
              {t("preview")}
            </button>
            <input
              aria-label={t("testRecipient")}
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              className="min-w-60 rounded-md border p-2 dark:bg-gray-800"
              placeholder={t("testPhone")}
            />
            <button
              type="button"
              disabled={busy || saving}
              onClick={() => void sendTest()}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2"
            >
              <Send size={16} /> {t("sendTest")}
            </button>
          </div>
          {preview ? (
            <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-4 text-sm dark:bg-gray-900">
              {preview}
            </pre>
          ) : null}
        </form>
      </div>

      <section className="rounded-lg border p-5 dark:border-gray-700">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t("history")}</h2>
          <button
            type="button"
            aria-label={t("refresh")}
            onClick={() => void reload()}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <section
          className="overflow-x-auto"
          aria-label={t("history")}
          tabIndex={0}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">{t("event")}</th>
                <th className="p-2">{t("recipient")}</th>
                <th className="p-2">{t("channel")}</th>
                <th className="p-2">{t("status")}</th>
                <th className="p-2">{t("attempts")}</th>
                <th className="p-2">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-b dark:border-gray-700">
                  <td className="p-2">{t(`events.${delivery.event}`)}</td>
                  <td className="p-2">{delivery.recipient}</td>
                  <td className="p-2">{delivery.channel}</td>
                  <td className="p-2">{t(`statuses.${delivery.status}`)}</td>
                  <td className="p-2">
                    {delivery.attempts}/{delivery.maxAttempts}
                  </td>
                  <td className="p-2">
                    {delivery.status === "failed" ||
                    delivery.status === "pending_approval" ? (
                      <button
                        type="button"
                        disabled={busy || saving}
                        onClick={() => void deliveryAction(delivery)}
                        className="text-blue-600 hover:underline"
                      >
                        {delivery.status === "failed"
                          ? t("retry")
                          : t("approve")}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}
