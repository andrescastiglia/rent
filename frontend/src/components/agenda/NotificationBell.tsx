"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { noticesApi, type WebNotice } from "@/lib/api/agenda";
import { enableWebPush, disableWebPush } from "@/lib/web-push";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
export default function NotificationBell() {
  const t = useTranslations("agenda"),
    router = useLocalizedRouter();
  const [open, setOpen] = useState(false),
    [data, setData] = useState<WebNotice[]>([]),
    [unread, setUnread] = useState(0),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [prefs, setPrefs] = useState<Array<{ event: string; enabled: boolean }>>(
      [],
    );
  const load = useCallback(async () => {
    try {
      const result = await noticesApi.list(page);
      setData(result.data);
      setUnread(result.unread);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    }
  }, [page, t]);
  useEffect(() => {
    let active = true;
    const reload = () => {
      if (active && document.visibilityState === "visible") void load();
    };
    reload();
    const timer = setInterval(reload, 30000);
    document.addEventListener("visibilitychange", reload);
    navigator.serviceWorker?.addEventListener("message", reload);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", reload);
      navigator.serviceWorker?.removeEventListener("message", reload);
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    noticesApi
      .preferences()
      .then((p) => {
        if (active) setPrefs(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        className="relative inline-flex items-center justify-center p-2 rounded border"
        aria-label={`${t("notifications")} (${unread})`}
        aria-expanded={open}
        aria-controls="rent-notification-inbox"
        onClick={() => setOpen(!open)}
      >
        <Bell aria-hidden="true" size={20} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 rounded-full bg-blue-600 px-1 text-xs text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id="rent-notification-inbox"
          aria-label={t("notifications")}
          className="fixed right-3 top-20 w-80 max-w-[90vw] max-h-[75vh] overflow-auto bg-white dark:bg-gray-800 border rounded p-4 z-50 space-y-3"
        >
          <h2 className="font-semibold">{t("notifications")}</h2>
          <button
            className="border rounded p-2"
            onClick={async () => {
              try {
                setError("");
                if (!(await enableWebPush())) setError(t("pushDenied"));
              } catch (e) {
                setError(e instanceof Error ? e.message : t("error"));
              }
            }}
          >
            {t("enablePush")}
          </button>
          <button
            className="border rounded p-2"
            onClick={() =>
              void disableWebPush().catch((e) => setError(e.message))
            }
          >
            {t("disablePush")}
          </button>
          {error && <p role="alert">{error}</p>}
          <ul>
            {data.map((n) => (
              <li key={n.id} className="border-b py-2">
                <button
                  className={`text-left underline ${!n.readAt ? "font-semibold" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/notifications/${n.id}`);
                  }}
                >
                  {n.title}
                </button>
                <p className="text-sm">{t(`noticeEvents.${n.event}`)}</p>
                {!n.readAt && (
                  <button
                    className="text-sm underline"
                    onClick={async () => {
                      try {
                        await noticesApi.read(n.id);
                        await load();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : t("error"));
                      }
                    }}
                  >
                    {t("markRead")}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              {t("previous")}
            </button>
            <button
              disabled={page * 50 >= total}
              onClick={() => setPage(page + 1)}
            >
              {t("next")}
            </button>
          </div>
          <details>
            <summary>{t("preferences")}</summary>
            {prefs.map((p) => (
              <label key={p.event} className="block">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={async (e) => {
                    const updated = prefs.map((x) =>
                      x.event === p.event
                        ? { ...x, enabled: e.target.checked }
                        : x,
                    );
                    try {
                      await noticesApi.setPreferences(updated);
                      setPrefs(updated);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : t("error"));
                    }
                  }}
                />{" "}
                {t(`noticeEvents.${p.event}`)}
              </label>
            ))}
          </details>
        </section>
      )}
    </div>
  );
}
