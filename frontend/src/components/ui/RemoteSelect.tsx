"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { PageResult } from "@/lib/pagination";
import { Button, FormField } from "./primitives";

export type RemoteOption = { value: string; label: string };
export function RemoteSelect({
  id,
  label,
  value,
  onChange,
  load,
  required = false,
  disabled = false,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  load: (search: string, page: number) => Promise<PageResult<RemoteOption>>;
  required?: boolean;
  disabled?: boolean;
}>) {
  const t = useTranslations("remoteSelect");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PageResult<RemoteOption>>({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  const [selected, setSelected] = useState<RemoteOption>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const term = useDebouncedValue(search);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setFailed(false);
    loadRef
      .current(term, page)
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [term, page, revision]);
  const options =
    selected?.value === value &&
    !result.data.some((item) => item.value === value)
      ? [selected, ...result.data]
      : result.data;
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={`${id}-search`} className="block text-sm font-medium">
        {t("search", { label })}
      </label>
      <input
        id={`${id}-search`}
        type="search"
        className="ui-field"
        value={search}
        disabled={disabled}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      <FormField id={id} label={label} error={failed ? t("error") : undefined}>
        {(attributes) => (
          <select
            {...attributes}
            className="ui-field"
            required={required}
            disabled={disabled || busy || failed}
            aria-busy={busy || undefined}
            value={value}
            onChange={(event) => {
              setSelected(
                options.find((item) => item.value === event.target.value),
              );
              onChange(event.target.value);
            }}
          >
            <option value="">{busy ? t("loading") : t("choose")}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </FormField>
      {failed ? (
        <Button
          variant="secondary"
          onClick={() => setRevision((count) => count + 1)}
        >
          {t("retry")}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{t("total", { total: result.total })}</span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              disabled={disabled || busy || page <= 1}
              onClick={() => setPage((count) => count - 1)}
            >
              {t("previous")}
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || busy || page * result.limit >= result.total}
              onClick={() => setPage((count) => count + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
