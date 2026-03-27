"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import {
  getCurrentPath,
  reportClientError,
  reportWebVital,
} from "@/lib/frontend-metrics";

export function FrontendMetricsReporter() {
  useReportWebVitals((metric) => {
    reportWebVital(metric.name, metric.value, getCurrentPath());
  });

  useEffect(() => {
    const onError = () => {
      reportClientError("error", getCurrentPath());
    };

    const onUnhandledRejection = () => {
      reportClientError("unhandled_rejection", getCurrentPath());
    };

    globalThis.addEventListener("error", onError);
    globalThis.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      globalThis.removeEventListener("error", onError);
      globalThis.removeEventListener(
        "unhandledrejection",
        onUnhandledRejection,
      );
    };
  }, []);

  return null;
}
