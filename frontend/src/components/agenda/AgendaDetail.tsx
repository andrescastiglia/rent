"use client";
import { GeoCard } from "@/components/contact-data/GeoCard";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  agendaApi,
  type AgendaEntry,
  type AgendaPerson,
} from "@/lib/api/agenda";
import TaskForm from "./TaskForm";
import EntrySettings from "./EntrySettings";
export default function AgendaDetail({
  id,
  personType,
  personId,
}: {
  id?: string;
  personType?: string;
  personId?: string;
}) {
  const t = useTranslations("agenda"),
    locale = useLocale();
  const [entry, setEntry] = useState<AgendaEntry | null>(null),
    [person, setPerson] = useState<{
      name: string;
      phone: string | null;
      email: string | null;
    } | null>(null),
    [tasks, setTasks] = useState<AgendaEntry[]>([]),
    [history, setHistory] = useState<
      Array<{ event: string; version: number; createdAt: string }>
    >([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [followup, setFollowup] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError("");
    setPerson(null);
    setTasks([]);
    setHistory([]);
    let active = true;
    (async () => {
      try {
        const e = id ? await agendaApi.entry(id) : null;
        if (!active) return;
        setEntry(e);
        const type = e ? e.personType : personType,
          pid = e ? e.personId : personId;
        if (type && pid) {
          const [p, list] = await Promise.all([
            agendaApi.person(type, pid),
            agendaApi.list({
              personType: type,
              personId: pid,
              status: "all",
              limit: 100,
            }),
          ]);
          if (!active) return;
          setPerson(p);
          setTasks(list.data);
        }
        if (e) {
          const h = await agendaApi.history(e.id);
          if (active) setHistory(h);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : t("error"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, personType, personId, revision, t]);
  function saved() {
    setEditing(false);
    setFollowup(false);
    setRevision((r) => r + 1);
  }
  const linkedType = entry ? entry.personType : personType,
    linkedId = entry ? entry.personId : personId;
  const linked =
    person && linkedType && linkedId
      ? ({
          ...person,
          personType: linkedType,
          personId: linkedId,
        } as AgendaPerson)
      : undefined;
  return (
    <section className="space-y-4">
      <Link className="underline" href={`/${locale}/agenda`}>
        {t("heading")}
      </Link>
      {error && <p role="alert">{error}</p>}
      {entry?.kind === "visit" && <GeoCard entryId={entry.id} />}
      {person && (
        <section className="border-b pb-4">
          <h1 className="text-2xl font-semibold">{person.name}</h1>
          {person.phone && (
            <p>
              <a className="underline" href={`tel:${person.phone}`}>
                {person.phone}
              </a>
            </p>
          )}
          {person.email && (
            <p>
              <a className="underline" href={`mailto:${person.email}`}>
                {person.email}
              </a>
            </p>
          )}
          <h2 className="font-semibold mt-3">{t("followup")}</h2>
          <ul>
            {tasks.map((e) => (
              <li key={e.id}>
                <Link
                  className="underline"
                  href={`/${locale}/agenda/people/${linkedType}/${linkedId}?entry=${encodeURIComponent(e.id)}`}
                >
                  {e.title}
                </Link>{" "}
                · {t(`statuses.${e.status}`)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!person && linkedId && <p>{t("personUnavailable")}</p>}
      {entry && (
        <>
          <h2 className="text-xl font-semibold">{entry.title}</h2>
          <p>{entry.description}</p>
          <p>
            {t("responsible")}: {entry.responsibleName || t("unassigned")}
          </p>
          <p>
            {entry.scheduledDate ??
              (entry.scheduledAt
                ? new Intl.DateTimeFormat(locale, {
                    timeZone: entry.timezone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(entry.scheduledAt))
                : t("unscheduled"))}{" "}
            · {t(`statuses.${entry.status}`)}
          </p>
          {entry.personId && entry.personType && !personType && person && (
            <Link
              className="underline"
              href={`/${locale}/agenda/people/${entry.personType}/${entry.personId}?entry=${encodeURIComponent(entry.id)}`}
            >
              {t("openPerson")}
            </Link>
          )}
          {entry.canEdit && (
            <button
              className="border rounded p-2"
              onClick={() => setEditing(!editing)}
            >
              {t("edit")}
            </button>
          )}
          {entry.editable && entry.canEdit && (
            <button
              className="border rounded p-2 ml-2"
              disabled={entry.status !== "pending"}
              onClick={async () => {
                try {
                  await agendaApi.update(
                    entry.id,
                    {
                      version: Number(entry.version.split(":")[0]),
                      status: "completed",
                    },
                    crypto.randomUUID(),
                  );
                  saved();
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("error"));
                }
              }}
            >
              {t("complete")}
            </button>
          )}
          {entry.editable && entry.canEdit && (
            <button
              className="border rounded p-2 ml-2"
              disabled={entry.status !== "pending"}
              onClick={async () => {
                try {
                  await agendaApi.update(
                    entry.id,
                    {
                      version: Number(entry.version.split(":")[0]),
                      status: "cancelled",
                    },
                    crypto.randomUUID(),
                  );
                  saved();
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("error"));
                }
              }}
            >
              {t("cancelTask")}
            </button>
          )}
          {editing &&
            (entry.editable ? (
              <TaskForm key={entry.version} entry={entry} onSaved={saved} />
            ) : (
              <EntrySettings
                key={entry.version}
                entry={entry}
                onSaved={saved}
              />
            ))}
          {!entry.editable && (
            <>
              <p>{t("derived")}</p>
              {entry.canEdit && (
                <Link
                  className="underline"
                  href={`/${locale}${entry.sourceType === "property" ? `/properties/${entry.sourceId}/visits/${entry.id.split(":")[1]}/result` : entry.sourceType === "maintenance" ? `/maintenance/${entry.sourceId}` : entry.sourceType === "sale" ? `/sales/${entry.sourceId}` : entry.sourceType === "lease" ? `/leases/${entry.sourceId}` : `/invoices/${entry.sourceId}`}`}
                >
                  {t("openSource")}
                </Link>
              )}
            </>
          )}
          <button
            className="border rounded p-2"
            onClick={() => setFollowup(!followup)}
          >
            {t("newFollowup")}
          </button>
        </>
      )}
      {!loading && !error && (!entry || followup) && (
        <TaskForm person={linked} relatedEntryId={entry?.id} onSaved={saved} />
      )}
      {history.length > 0 && (
        <section>
          <h2 className="font-semibold">{t("history")}</h2>
          <ul>
            {history.map((h) => (
              <li key={h.version}>
                {h.createdAt} · {t(`events.${h.event}`)} · {h.version}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
