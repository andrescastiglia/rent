"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  agendaApi,
  type AgendaEntry,
  type AgendaPerson,
  type AgendaTaskInput,
} from "@/lib/api/agenda";
import { civilDateTimeToIso } from "../../../../shared/agenda";
export default function TaskForm({
  entry,
  onSaved,
  person,
  relatedEntryId,
}: {
  entry?: AgendaEntry;
  onSaved: (id: string) => void;
  person?: AgendaPerson;
  relatedEntryId?: string;
}) {
  const t = useTranslations("agenda");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.description ?? "");
  const [kind, setKind] = useState(entry?.kind ?? "task");
  const [people, setPeople] = useState<AgendaPerson[]>([]),
    [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState(
    person ? `${person.personType}:${person.personId}` : "",
  );
  const [responsible, setResponsible] = useState(
    entry?.responsibleUserId ?? "",
  );
  const [schedule, setSchedule] = useState(
    entry?.scheduledDate ? "date" : entry?.scheduledAt ? "time" : "none",
  );
  const [date, setDate] = useState(entry?.scheduledDate ?? "");
  const [companyConfig, setCompanyConfig] = useState<{
    timezone: string;
    reminderMinutes: number;
    reminderHour: number;
  }>();
  const timezone =
    entry?.timezone ??
    companyConfig?.timezone ??
    "America/Argentina/Buenos_Aires";
  const localValue = (iso: string | null) => {
    if (!iso) return "";
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(iso))
        .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  const [time, setTime] = useState(localValue(entry?.scheduledAt ?? null)),
    [end, setEnd] = useState(localValue(entry?.endsAt ?? null));
  const [minutes, setMinutes] = useState(entry?.reminderMinutes ?? 15),
    [hour, setHour] = useState(entry?.reminderHour ?? 9),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const command = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    agendaApi
      .config()
      .then((c) => {
        if (active) {
          setCompanyConfig(c);
          if (!entry) {
            setMinutes(c.reminderMinutes);
            setHour(c.reminderHour);
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    agendaApi
      .staff()
      .then((data) => {
        if (active) setStaff(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      agendaApi
        .people(search)
        .then((data) => {
          if (active) setPeople(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const [personType, personId] = selected.split(":");
      const payload: AgendaTaskInput = {
        title,
        description: body || null,
        kind,
        responsibleUserId: responsible || null,
        scheduledDate: schedule === "date" ? date : null,
        scheduledAt:
          schedule === "time" ? civilDateTimeToIso(time, timezone) : null,
        endsAt:
          schedule === "time" && end ? civilDateTimeToIso(end, timezone) : null,
        reminderMinutes: minutes,
        reminderHour: hour,
        ...(!entry
          ? {
              personType: personType || null,
              personId: personId || null,
              relatedEntryId: relatedEntryId ?? null,
            }
          : {}),
      };
      if (schedule === "date" && !date) throw new Error(t("requiredDate"));
      const signature = JSON.stringify(payload);
      if (command.current?.payload !== signature)
        command.current = { payload: signature, key: crypto.randomUUID() };
      if (entry) {
        await agendaApi.update(
          entry.id,
          { ...payload, version: Number(entry.version.split(":")[0]) },
          command.current!.key,
        );
        onSaved(entry.id);
      } else {
        const result = await agendaApi.create(payload, command.current!.key);
        onSaved(result.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  }
  const cls = "border rounded p-2 bg-background w-full";
  return (
    <form
      onSubmit={submit}
      className="grid gap-4 max-w-xl"
      aria-label={t("taskForm")}
    >
      <label>
        {t("title")}
        <input
          className={cls}
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        {t("kind")}
        <select
          className={cls}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {["task", "call", "visit"].map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("description")}
        <textarea
          className={cls}
          maxLength={10000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {!entry && (
        <>
          <label>
            {t("findPerson")}
            <input
              className={cls}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            {t("person")}
            <select
              className={cls}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">{t("noPerson")}</option>
              {person &&
                !people.some(
                  (p) =>
                    p.personId === person.personId &&
                    p.personType === person.personType,
                ) && (
                  <option value={`${person.personType}:${person.personId}`}>
                    {person.name}
                  </option>
                )}
              {people.map((p) => (
                <option
                  key={`${p.personType}:${p.personId}`}
                  value={`${p.personType}:${p.personId}`}
                >
                  {p.name} · {p.personType}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        {t("responsible")}
        <select
          className={cls}
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
      <label>
        {t("schedule")}
        <select
          className={cls}
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
        >
          {["none", "date", "time"].map((s) => (
            <option key={s} value={s}>
              {t(`scheduleKinds.${s}`)}
            </option>
          ))}
        </select>
      </label>
      {schedule === "date" && (
        <label>
          {t("date")}
          <input
            type="date"
            className={cls}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      )}
      {schedule === "time" && (
        <>
          <label>
            {t("dateTime")} ({timezone})
            <input
              type="datetime-local"
              required
              className={cls}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label>
            {t("end")}
            <input
              type="datetime-local"
              className={cls}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </>
      )}
      {schedule === "time" && (
        <label>
          {t("reminderMinutes")}
          <input
            type="number"
            min={0}
            max={10080}
            className={cls}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
      )}
      {schedule === "date" && (
        <label>
          {t("reminderHour")}
          <input
            type="number"
            min={0}
            max={23}
            className={cls}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="rounded bg-primary text-white p-2"
        disabled={busy || !companyConfig}
      >
        {busy ? t("saving") : t("save")}
      </button>
    </form>
  );
}
