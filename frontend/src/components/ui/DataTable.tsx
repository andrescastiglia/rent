"use client";

import type { Key, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, StatePanel, Surface } from "./primitives";

export type TableColumn<T> = {
  key: string;
  title: string;
  render: (item: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
};

export function DataTable<T>({
  items,
  columns,
  rowKey,
  caption,
  emptyTitle,
  emptyAction,
  renderMobileSummary,
}: Readonly<{
  items: readonly T[];
  columns: readonly TableColumn<T>[];
  rowKey: (item: T) => Key;
  caption: string;
  emptyTitle: string;
  emptyAction?: ReactNode;
  renderMobileSummary?: (item: T) => ReactNode;
}>) {
  if (!items.length)
    return (
      <Surface>
        <StatePanel title={emptyTitle} action={emptyAction} />
      </Surface>
    );
  return (
    <Surface className="overflow-hidden">
      {renderMobileSummary && (
        <ul aria-label={caption} className="divide-y divide-line md:hidden">
          {items.map((item) => (
            <li key={rowKey(item)} className="p-4">
              {renderMobileSummary(item)}
            </li>
          ))}
        </ul>
      )}
      <div
        className={`max-w-full overflow-x-auto ${renderMobileSummary ? "hidden md:block" : ""}`}
      >
        <table className="ui-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={
                    column.align === "right" ? "!text-right" : undefined
                  }
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={rowKey(item)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`${column.align === "right" ? "money" : ""} ${column.className ?? ""}`}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  busy = false,
  onPageChange,
}: Readonly<{
  page: number;
  pageSize: number;
  total: number;
  busy?: boolean;
  onPageChange: (page: number) => void;
}>) {
  const t = useTranslations("ui");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label={t("pagination")}
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-muted">
        {t("pageSummary", { page, totalPages, total })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={busy || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t("previous")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </nav>
  );
}
