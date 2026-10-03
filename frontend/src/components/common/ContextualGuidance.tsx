"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lightbulb, Pause, X } from "lucide-react";
import {
  chooseGuidance,
  guidanceBlocked,
  guidanceDelay,
  isAvailableControl,
  screenGuidance,
  type GuidanceSuggestion,
} from "@/lib/contextual-guidance";
import {
  ASSISTANT_GUIDANCE_EVENT,
  clearAssistantGuidance,
  chooseAssistantGuidance,
  pendingAssistantGuidance,
  type AiUiAction,
  assistantEditorTrigger,
} from "@/lib/assistant-guidance";

const PREFERENCE_KEY = "rent:guidance:paused";
const EVENTS = ["input", "change", "pointerdown", "keydown", "scroll"] as const;

export default function ContextualGuidance({
  rootId = "main-content",
  entryDelay,
  taskDelay,
}: Readonly<{ rootId?: string; entryDelay?: number; taskDelay?: number }>) {
  const pathname = usePathname();
  const t = useTranslations("guidance");
  const [paused, setPaused] = useState(false);
  const [suggestion, setSuggestion] = useState<GuidanceSuggestion>();
  const [manualRequest, setManualRequest] = useState<AiUiAction>();
  const seen = useRef(new Set<string>());
  const active = useRef<GuidanceSuggestion | undefined>(undefined);
  const restart = useRef<() => void>(() => {});

  useEffect(() => {
    try {
      setPaused(localStorage.getItem(PREFERENCE_KEY) === "true");
    } catch {
      /* Storage is optional. */
    }
  }, []);

  useEffect(() => {
    const root = document.getElementById(rootId);
    const rule = screenGuidance(pathname);
    seen.current.clear();
    active.current = undefined;
    setSuggestion(undefined);
    if (!root || !rule || paused || manualRequest) return;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      if (active.current) delete active.current.target.dataset.guidanceTarget;
      active.current = undefined;
      setSuggestion(undefined);
    };
    const schedule = () => {
      clearTimeout(timer);
      if (guidanceBlocked(root) || document.hidden) return;
      const delay = started
        ? guidanceDelay(
            taskDelay ?? process.env.NEXT_PUBLIC_GUIDANCE_TASK_DELAY_MS,
            12000,
          )
        : guidanceDelay(
            entryDelay ?? process.env.NEXT_PUBLIC_GUIDANCE_ENTRY_DELAY_MS,
            8000,
          );
      timer = setTimeout(() => {
        const next = chooseGuidance(
          root,
          rule,
          started ? "task" : "entry",
          seen.current,
        );
        if (!next) return;
        seen.current.add(next.id);
        next.target.dataset.guidanceTarget = "";
        active.current = next;
        setSuggestion(next);
      }, delay);
    };
    restart.current = schedule;
    const interaction = (event: Event) => {
      if (
        event.type === "keydown" &&
        (event as KeyboardEvent).key === "Escape" &&
        active.current
      ) {
        hide();
        schedule();
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest("[data-guidance-ui]")
      )
        return;
      if (event.type === "input" || event.type === "change") started = true;
      if (
        event.type === "pointerdown" &&
        event.target instanceof Element &&
        event.target.closest("form, [data-guide-task]")
      )
        started = true;
      hide();
      schedule();
    };
    const reevaluate = () => {
      // A loading/error/dialog state has priority over guidance. Reevaluate on completion.
      if (
        document.hidden ||
        guidanceBlocked(root) ||
        (active.current && !isAvailableControl(active.current.target))
      )
        hide();
      if (!active.current) schedule();
    };
    const completed = () => {
      started = false;
      seen.current.clear();
      hide();
      schedule();
    };
    EVENTS.forEach((event) =>
      document.addEventListener(event, interaction, true),
    );
    document.addEventListener("visibilitychange", reevaluate);
    window.addEventListener("resize", interaction);
    root.addEventListener("rent:task-completed", completed);
    const observer = new MutationObserver(reevaluate);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-busy",
        "aria-invalid",
        "disabled",
        "open",
        "hidden",
        "inert",
      ],
    });
    schedule();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      hide();
      EVENTS.forEach((event) =>
        document.removeEventListener(event, interaction, true),
      );
      document.removeEventListener("visibilitychange", reevaluate);
      window.removeEventListener("resize", interaction);
      root.removeEventListener("rent:task-completed", completed);
    };
  }, [pathname, paused, rootId, entryDelay, taskDelay, manualRequest]);

  useEffect(() => {
    const requested = () => {
      const action = pendingAssistantGuidance(pathname);
      setManualRequest(action);
    };
    requested();
    window.addEventListener(ASSISTANT_GUIDANCE_EVENT, requested);
    return () =>
      window.removeEventListener(ASSISTANT_GUIDANCE_EVENT, requested);
  }, [pathname]);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root || !manualRequest) return;
    let editorOpened = false;
    const hide = () => {
      if (active.current) delete active.current.target.dataset.guidanceTarget;
      active.current = undefined;
      setSuggestion(undefined);
    };
    const show = () => {
      if (document.hidden) {
        hide();
        return;
      }
      if (!editorOpened) {
        const trigger = assistantEditorTrigger(root, manualRequest);
        if (trigger) {
          editorOpened = true;
          trigger.click();
          return;
        }
      }
      if (root.querySelector('[aria-busy="true"]')) return;
      if (
        manualRequest.recordId &&
        !editorOpened &&
        !Array.from(
          root.querySelectorAll<HTMLElement>("[data-assistant-ready]"),
        ).some(
          (element) =>
            element.dataset.assistantRecord === manualRequest.recordId,
        )
      )
        return;
      const next = chooseAssistantGuidance(root, manualRequest);
      if (!next) {
        hide();
        return;
      }
      if (
        active.current?.id === next.id &&
        active.current.target === next.target
      )
        return;
      hide();
      next.target.scrollIntoView?.({ block: "center", behavior: "smooth" });
      next.target.dataset.guidanceTarget = "";
      active.current = next;
      setSuggestion(next);
      clearAssistantGuidance();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
        setManualRequest(undefined);
      }
    };
    // A destination can render after navigation or profile loading. Keep the
    // request until its actual control appears; never guess a generic button.
    const observer = new MutationObserver(show);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-busy", "hidden", "open"],
    });
    root.addEventListener("input", show);
    document.addEventListener("keydown", escape);
    document.addEventListener("visibilitychange", show);
    const expiry = setTimeout(() => {
      clearAssistantGuidance();
      setManualRequest(undefined);
    }, 60000);
    show();
    return () => {
      clearTimeout(expiry);
      observer.disconnect();
      hide();
      root.removeEventListener("input", show);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("visibilitychange", show);
    };
  }, [manualRequest, pathname, rootId]);

  const setPreference = (value: boolean) => {
    if (value) {
      clearAssistantGuidance();
      setManualRequest(undefined);
    }
    setPaused(value);
    try {
      localStorage.setItem(PREFERENCE_KEY, String(value));
    } catch {
      /* Help works without persistence. */
    }
  };
  const close = () => {
    if (suggestion) delete suggestion.target.dataset.guidanceTarget;
    active.current = undefined;
    setSuggestion(undefined);
    setManualRequest(undefined);
    restart.current();
  };

  const bottom = rootId === "portal-content" ? 96 : 16;
  if (paused && !manualRequest)
    return (
      <button
        type="button"
        data-guidance-ui
        style={{ bottom }}
        className="btn btn-secondary fixed right-3 z-40 shadow-sm"
        onClick={() => setPreference(false)}
        aria-label={t("resume")}
      >
        <Lightbulb size={16} aria-hidden="true" />
        {t("resume")}
      </button>
    );
  if (!suggestion) return null;
  const rect = suggestion.target.getBoundingClientRect();
  const width = Math.min(352, window.innerWidth - 32);
  const nearTarget = rect.bottom + 220 < window.innerHeight;
  const bubble = (
    <aside
      data-guidance-ui
      aria-label={t("title")}
      className="ui-surface fixed z-40 p-4 shadow-lg"
      style={{
        width,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        ...(nearTarget ? { top: rect.bottom + 12 } : { bottom }),
      }}
    >
      <div className="flex items-start gap-3">
        <Lightbulb
          className="mt-0.5 shrink-0 text-primary"
          size={20}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-primary">{t("title")}</p>
          <output
            aria-live="polite"
            aria-atomic="true"
            className="mt-1 text-sm text-foreground"
          >
            {suggestion.text ??
              t(suggestion.message, { field: suggestion.field ?? "" })}
          </output>
        </div>
        <button
          className="btn btn-ghost -mt-1 shrink-0 px-2"
          type="button"
          aria-label={t("close")}
          onClick={close}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (isAvailableControl(suggestion.target)) {
              suggestion.target.focus();
              if (!manualRequest) close();
            }
          }}
        >
          {t("goToControl")}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setPreference(true)}
        >
          <Pause size={14} aria-hidden="true" />
          {t("pause")}
        </button>
      </div>
    </aside>
  );
  const dialog = suggestion.target.closest("dialog[open]");
  return dialog ? createPortal(bubble, dialog) : bubble;
}
