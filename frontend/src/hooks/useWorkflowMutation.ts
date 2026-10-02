"use client";
import { useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api";

/** Explicit recovery only; the adapter conserves the durable operation key. */
export function useWorkflowMutation<T>(
  execute: (request: T) => Promise<unknown>,
) {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<T>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);
  async function submit(request: T) {
    if (active.current) return false;
    active.current = true;
    setBusy(true);
    setError(undefined);
    setSuccess(false);
    const value = pending ?? request;
    try {
      await execute(value);
      setPending(undefined);
      setSuccess(true);
      return true;
    } catch (error_) {
      const definite =
        !pending &&
        error_ instanceof ApiRequestError &&
        [400, 401, 403, 404, 409, 422].includes(error_.status);
      if (!definite) setPending(value);
      setError(definite ? "rejected" : "uncertain");
      return false;
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  function reset() {
    if (!pending && !busy) {
      setSuccess(false);
      setError(undefined);
    }
  }
  return { submit, busy, pending, error, success, reset };
}
