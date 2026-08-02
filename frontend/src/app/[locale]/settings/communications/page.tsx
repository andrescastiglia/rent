"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Send, Save } from "lucide-react";
import { useLocale } from "next-intl";
import {
  CommunicationChannel,
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
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [deliveries, setDeliveries] = useState<CommunicationDelivery[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CommunicationTemplateInput>(EMPTY_TEMPLATE);
  const [preview, setPreview] = useState<string>("");
  const [testRecipient, setTestRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        setMessage("No se pudo cargar la configuración.");
      })
      .finally(() => setLoading(false));
  }, [load]);

  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId),
    [selectedId, templates],
  );

  const selectTemplate = (template: CommunicationTemplate | null) => {
    setSelectedId(template?.id ?? null);
    setForm(template ? { ...template } : EMPTY_TEMPLATE);
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
      setMessage("Plantilla guardada.");
    } catch (error) {
      console.error("Failed to save communication template", error);
      setMessage("No se pudo guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  };

  const showPreview = async () => {
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
          ? `Faltan: ${result.missingVariables.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  };

  const sendTest = async () => {
    if (!testRecipient.trim()) {
      setMessage("Ingresá un destinatario para la prueba.");
      return;
    }
    const delivery = await communicationsApi.sendTest({
      subject: form.subject ?? undefined,
      body: form.body,
      variables: SAMPLE_VARIABLES,
      channel: form.channel,
      recipient: testRecipient.trim(),
    });
    setMessage(`Prueba registrada con estado: ${delivery.status}.`);
    await load();
  };

  const deliveryAction = async (delivery: CommunicationDelivery) => {
    if (delivery.status === "failed")
      await communicationsApi.retry(delivery.id);
    if (delivery.status === "pending_approval") {
      await communicationsApi.approve(delivery.id);
    }
    await load();
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
          <h1 className="text-3xl font-bold">Plantillas y comunicaciones</h1>
          <p className="text-sm text-gray-500">
            Automatización, consentimiento e historial por canal.
          </p>
        </div>
        <Link
          href={`/${locale}/settings`}
          className="inline-flex items-center gap-1 text-gray-500"
        >
          <ArrowLeft size={16} /> Volver
        </Link>
      </div>

      {message ? (
        <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2 rounded-lg border p-4 dark:border-gray-700">
          <button
            onClick={() => selectTemplate(null)}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-white"
          >
            Nueva plantilla
          </button>
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => selectTemplate(template)}
              className={`w-full rounded-md border p-3 text-left text-sm dark:border-gray-700 ${selected?.id === template.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : ""}`}
            >
              <span className="block font-medium">{template.name}</span>
              <span className="text-xs text-gray-500">
                {template.event} · {template.recipientRole} · {template.channel}
              </span>
            </button>
          ))}
        </aside>

        <form
          onSubmit={save}
          className="space-y-4 rounded-lg border p-5 dark:border-gray-700"
        >
          <input
            aria-label="Nombre"
            required
            value={form.name}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, name: event.target.value }))
            }
            className="w-full rounded-md border p-2 dark:bg-gray-800"
            placeholder="Nombre de la plantilla"
          />
          <div className="grid gap-3 md:grid-cols-4">
            <select
              aria-label="Evento"
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
                <option key={event}>{event}</option>
              ))}
            </select>
            <select
              aria-label="Rol"
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
              <option value="tenant">Inquilino</option>
              <option value="owner">Propietario</option>
              <option value="interested">Interesado</option>
            </select>
            <select
              aria-label="Canal"
              value={form.channel}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  channel: event.target.value as CommunicationChannel,
                }))
              }
              className="rounded-md border p-2 dark:bg-gray-800"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
            <input
              aria-label="Idioma"
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
            aria-label="Asunto"
            value={form.subject ?? ""}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                subject: event.target.value,
              }))
            }
            className="w-full rounded-md border p-2 dark:bg-gray-800"
            placeholder="Asunto (email)"
          />
          <textarea
            aria-label="Mensaje"
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
              Activa
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
              Envío automático
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
              Requiere aprobación
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white"
            >
              <Save size={16} /> {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => void showPreview()}
              className="rounded-md border px-4 py-2"
            >
              Vista previa
            </button>
            <input
              aria-label="Destinatario de prueba"
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              className="min-w-60 rounded-md border p-2 dark:bg-gray-800"
              placeholder="Teléfono o email de prueba"
            />
            <button
              type="button"
              onClick={() => void sendTest()}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2"
            >
              <Send size={16} /> Enviar prueba
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
          <h2 className="text-xl font-semibold">Historial de envíos</h2>
          <button onClick={() => void load()}>
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Evento</th>
                <th className="p-2">Destinatario</th>
                <th className="p-2">Canal</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Intentos</th>
                <th className="p-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-b dark:border-gray-700">
                  <td className="p-2">{delivery.event}</td>
                  <td className="p-2">{delivery.recipient}</td>
                  <td className="p-2">{delivery.channel}</td>
                  <td className="p-2">{delivery.status}</td>
                  <td className="p-2">
                    {delivery.attempts}/{delivery.maxAttempts}
                  </td>
                  <td className="p-2">
                    {delivery.status === "failed" ||
                    delivery.status === "pending_approval" ? (
                      <button
                        onClick={() => void deliveryAction(delivery)}
                        className="text-blue-600 hover:underline"
                      >
                        {delivery.status === "failed"
                          ? "Reintentar"
                          : "Aprobar"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
