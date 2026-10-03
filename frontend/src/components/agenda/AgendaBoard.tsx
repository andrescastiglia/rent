"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import {
  agendaApi,
  type AgendaPage,
  type AgendaPerson,
} from "@/lib/api/agenda";
import {
  addDays,
  calendarRange,
  dayInZone,
  entryDay,
  isCivilDate,
} from "../../../../shared/agenda";
import TaskForm from "./TaskForm";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
export default function AgendaBoard() {
  const t = useTranslations("agenda"),
    locale = useLocale(),
    router = useLocalizedRouter(),
    { user } = useAuth();
  const [view, setView] = useState("list"),
    [day, setDay] = useState(dayInZone(new Date())),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [status, setStatus] = useState("pending"),
    [responsible, setResponsible] = useState(""),
    [person, setPerson] = useState(""),
    [unscheduled, setUnscheduled] = useState(false),
    [page, setPage] = useState(1),
    [creating, setCreating] = useState(false);
  const [data, setData] = useState<AgendaPage | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [people, setPeople] = useState<AgendaPerson[]>([]),
    [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const requestVersion = useRef(0);
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const internal = (user?.roles?.length ? user.roles : [user?.role]).some(
    (r) => r === "admin" || r === "staff",
  );
  useEffect(() => {
    if (!internal) return;
    let active = true;
    Promise.all([agendaApi.people(), agendaApi.staff(), agendaApi.config()])
      .then(([p, s, config]) => {
        if (active) {
          setPeople(p);
          setStaff(s);
          setTimezone(config.timezone);
          setDay(dayInZone(new Date(), config.timezone));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [internal, user?.companyId]);
  const refresh = useCallback(async () => {
    if (!internal) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const range = unscheduled ? null : calendarRange(day, view);
      const [personType, personId] = person.split(":");
      const result = await agendaApi.list({
        page,
        limit: 50,
        status,
        ...range,
        ...(search ? { search } : {}),
        ...(kind ? { kind } : {}),
        ...(responsible ? { responsibleUserId: responsible } : {}),
        ...(personId ? { personType, personId } : {}),
        ...(unscheduled ? { unscheduled: "true" } : {}),
      });
      if (requestVersion.current === version) setData(result);
    } catch (e) {
      if (requestVersion.current === version)
        setError(e instanceof Error ? e.message : t("error"));
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [
    internal,
    user?.companyId,
    day,
    view,
    page,
    status,
    search,
    kind,
    responsible,
    person,
    unscheduled,
    t,
  ]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) void refresh();
    }, 250);
    return () => {
      active = false;
      requestVersion.current++;
      clearTimeout(timer);
    };
  }, [refresh]);
  function filter(fn: () => void) {
    setPage(1);
    fn();
  }
  if (!internal) return <p>{t("internalOnly")}</p>;
  const range = calendarRange(day, view);
  const days = range
    ? Array.from(
        {
          length:
            Math.round(
              (Date.parse(range.to) - Date.parse(range.from)) / 86400000,
            ) + 1,
        },
        (_, i) => addDays(range.from, i),
      )
    : [];
  const cls = "border rounded p-2 bg-background";
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <button className={cls} onClick={() => setCreating(!creating)}>
          {creating ? t("close") : t("newTask")}
        </button>
      </div>
      {creating && (
        <TaskForm
          onSaved={(id) =>
            router.push(`/agenda/entries/${encodeURIComponent(id)}`)
          }
        />
      )}
      <div className="flex flex-wrap gap-3">
        <label>
          {t("view")}{" "}
          <select
            className={cls}
            value={view}
            onChange={(e) =>
              filter(() => {
                setView(e.target.value);
                setUnscheduled(false);
              })
            }
          >
            {["list", "day", "week", "month"].map((v) => (
              <option key={v} value={v}>
                {t(`views.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("date")}{" "}
          <input
            type="date"
            className={cls}
            value={day}
            onChange={(e) =>
              filter(
                () => isCivilDate(e.target.value) && setDay(e.target.value),
              )
            }
          />
        </label>
        <button
          className={cls}
          onClick={() => filter(() => setDay(dayInZone(new Date(), timezone)))}
        >
          {t("today")}
        </button>
        <button
          className={cls}
          onClick={() => filter(() => setUnscheduled(!unscheduled))}
          aria-pressed={unscheduled}
        >
          {t("unscheduled")}
        </button>
        <button className={cls} onClick={() => void refresh()}>
          {t("refresh")}
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <label>
          {t("search")}{" "}
          <input
            className={cls}
            value={search}
            onChange={(e) => filter(() => setSearch(e.target.value))}
          />
        </label>
        <label>
          {t("kind")}{" "}
          <select
            className={cls}
            value={kind}
            onChange={(e) => filter(() => setKind(e.target.value))}
          >
            <option value="">{t("all")}</option>
            {[
              "task",
              "call",
              "visit",
              "maintenance",
              "invoice",
              "lease",
              "sale",
            ].map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("status")}{" "}
          <select
            className={cls}
            value={status}
            onChange={(e) => filter(() => setStatus(e.target.value))}
          >
            {["pending", "completed", "cancelled", "all"].map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("responsible")}{" "}
          <select
            className={cls}
            value={responsible}
            onChange={(e) => filter(() => setResponsible(e.target.value))}
          >
            <option value="">{t("all")}</option>
            <option value="unassigned">{t("unassigned")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("person")}{" "}
          <select
            className={cls}
            value={person}
            onChange={(e) => filter(() => setPerson(e.target.value))}
          >
            <option value="">{t("all")}</option>
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
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">{t("loading")}</p>}
      {data &&
        !loading &&
        (view === "list" || unscheduled ? (
          <ul className="divide-y">
            {data.data.map((e) => (
              <li key={e.id} className="py-3">
                <Link
                  className="font-medium underline"
                  href={`/${locale}/agenda/entries/${encodeURIComponent(e.id)}`}
                >
                  {e.title}
                </Link>
                <p>
                  {e.personName ?? t("noPerson")} ·{" "}
                  {e.responsibleName || t("unassigned")} ·{" "}
                  {entryDay(e) ?? t("unscheduled")}
                  {e.scheduledAt &&
                    " · " +
                      new Intl.DateTimeFormat(locale, {
                        timeZone: e.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(e.scheduledAt))}{" "}
                  · {t(`statuses.${e.status}`)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div
            className={`grid gap-2 ${view === "month" ? "grid-cols-2 md:grid-cols-7" : view === "week" ? "grid-cols-1 md:grid-cols-7" : "grid-cols-1"}`}
          >
            {days.map((d) => (
              <section key={d} className="border rounded p-2 min-h-28">
                <h2 className="font-medium">
                  {new Intl.DateTimeFormat(locale, {
                    timeZone: "UTC",
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }).format(new Date(`${d}T12:00:00Z`))}
                </h2>
                <ul>
                  {data.data
                    .filter((e) => entryDay(e) === d)
                    .map((e) => (
                      <li key={e.id} className="py-1">
                        <Link
                          className="underline"
                          href={`/${locale}/agenda/entries/${encodeURIComponent(e.id)}`}
                        >
                          {e.title}
                        </Link>
                        <p className="text-sm">
                          {e.personName} ·{" "}
                          {e.responsibleName || t("unassigned")}
                        </p>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        ))}
      {data && !loading && (
        <div className="flex gap-3 items-center">
          <button
            className={cls}
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            {t("previous")}
          </button>
          <span>
            {page} · {data.total} {t("items")}
          </span>
          <button
            className={cls}
            disabled={page * data.limit >= data.total}
            onClick={() => setPage(page + 1)}
          >
            {t("next")}
          </button>
        </div>
      )}
    </section>
  );
}
