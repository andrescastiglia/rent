"use client";

import { useEffect } from "react";
import { initOtel } from "@/lib/otel";

export function OtelInitializer() {
  useEffect(() => {
    initOtel();
  }, []);

  return null;
}
