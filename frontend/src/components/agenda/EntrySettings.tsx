"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { agendaApi, type AgendaEntry } from "@/lib/api/agenda";
export default function EntrySettings({
  entry,
  onSaved,
}: {
  entry: AgendaEntry;
  onSaved: () => void;
}) {
  const t = useTranslations("agenda"),
    [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]),
    [responsible, setResponsible] = useState(entry.responsibleUserId ?? ""),
    [minutes, setMinutes] = useState(entry.reminderMinutes),
    [hour, setHour] = useState(entry.reminderHour),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const command = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    agendaApi
      .staff()
      .then((s) => {
        if (active) setStaff(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <form
      className="grid gap-3 max-w-xl"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const body = {
          version: entry.version,
          responsibleUserId: responsible || null,
          reminderMinutes: minutes,
          reminderHour: hour,
        };
        const payload = JSON.stringify(body);
        if (command.current?.payload !== payload)
          command.current = { payload, key: crypto.randomUUID() };
        try {
          await agendaApi.settings(entry.id, body, command.current.key);
          onSaved();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("error"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {t("responsible")}
        <select
          className="border rounded p-2 w-full"
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
        >
          <option value="">{t("unassigned")}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {entry.scheduledAt && (
        <label>
          {t("reminderMinutes")}
          <input
            className="border rounded p-2 w-full"
            type="number"
            min={0}
            max={10080}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
      )}
      {entry.scheduledDate && (
        <label>
          {t("reminderHour")}
          <input
            className="border rounded p-2 w-full"
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} className="border rounded p-2">
        {t("save")}
      </button>
    </form>
  );
}
