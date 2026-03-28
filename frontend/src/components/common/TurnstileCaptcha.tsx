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
    const browserWindow = globalThis.window;
    if (browserWindow.turnstile) {
      queueMicrotask(() => setReady(true));
      return;
    }

    browserWindow.__turnstileOnLoad = browserWindow.__turnstileOnLoad ?? [];
    browserWindow.__turnstileOnLoad.push(() => setReady(true));

    const existing = document.getElementById(SCRIPT_ID);
    if (existing instanceof HTMLScriptElement) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const callbacks = browserWindow.__turnstileOnLoad ?? [];
      callbacks.forEach((callback) => callback());
      browserWindow.__turnstileOnLoad = [];
    };
    document.head.appendChild(script);
  }, [siteKey]);

  useEffect(() => {
    const browserWindow = globalThis.window;
    if (
      !ready ||
      !siteKey ||
      !containerRef.current ||
      !browserWindow.turnstile
    ) {
      return;
    }
    if (widgetIdRef.current) {
      return;
    }

    const widgetId = browserWindow.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onTokenChange(token),
      "expired-callback": () => onTokenChange(null),
      "error-callback": () => onTokenChange(null),
    });
    widgetIdRef.current = widgetId;

    return () => {
      if (widgetIdRef.current && browserWindow.turnstile) {
        browserWindow.turnstile.remove(widgetIdRef.current);
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
