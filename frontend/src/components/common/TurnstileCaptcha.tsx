"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
    __turnstileOnLoad?: Array<() => void>;
  }
}

type Props = {
  onTokenChange: (token: string | null) => void;
};

const SCRIPT_ID = "turnstile-script";
const TURNSTILE_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileCaptcha({ onTokenChange }: Readonly<Props>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  useEffect(() => {
    if (!siteKey) return;
    if (window.turnstile) {
      queueMicrotask(() => setReady(true));
      return;
    }

    window.__turnstileOnLoad = window.__turnstileOnLoad ?? [];
    window.__turnstileOnLoad.push(() => setReady(true));

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement;
    if (existing) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const callbacks = window.__turnstileOnLoad ?? [];
      callbacks.forEach((callback) => callback());
      window.__turnstileOnLoad = [];
    };
    document.head.appendChild(script);
  }, [siteKey]);

  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current || !window.turnstile) {
      return;
    }
    if (widgetIdRef.current) {
      return;
    }

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onTokenChange(token),
      "expired-callback": () => onTokenChange(null),
      "error-callback": () => onTokenChange(null),
    });
    widgetIdRef.current = widgetId;

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onTokenChange, ready, siteKey]);

  if (!siteKey) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        CAPTCHA no configurado en frontend (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
      </div>
    );
  }

  return <div ref={containerRef} className="min-h-16" />;
}
