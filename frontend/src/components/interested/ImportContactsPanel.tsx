"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  DataTable,
  FormField,
  StatePanel,
  Surface,
} from "@/components/ui";
import { parseInterestedCsv } from "@/lib/interested-import";
import {
  interestedWorkflowApi,
  type ImportReview,
} from "@/lib/api/interested-workflow";
import { useWorkflowMutation } from "@/hooks/useWorkflowMutation";

export default function ImportContactsPanel() {
  const t = useTranslations("crmWorkflow");
  const [csv, setCsv] = useState("");
  const [review, setReview] = useState<ImportReview>();
  const [skipRows, setSkipRows] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const mutation = useWorkflowMutation(interestedWorkflowApi.applyImport);
  const locked = mutation.busy || Boolean(mutation.pending);
  async function preview() {
    mutation.reset();
    setLoading(true);
    setError(undefined);
    setReview(undefined);
    try {
      const result = await interestedWorkflowApi.previewImport(
        parseInterestedCsv(csv),
      );
      setReview(result);
      setSkipRows(
        result.rows
          .filter((row) => row.duplicateIds.length || row.duplicateRows.length)
          .map((row) => row.index),
      );
    } catch {
      setError("importError");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Surface className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t("importTitle")}</h2>
      <p className="text-sm text-muted">{t("importDescription")}</p>
      <FormField id="crm-import-csv" label={t("csv")} help={t("csvHelp")}>
        {(attributes) => (
          <textarea
            {...attributes}
            className="ui-field min-h-36 font-mono text-sm"
            value={csv}
            disabled={locked || loading}
            onChange={(event) => {
              setCsv(event.target.value);
              setReview(undefined);
            }}
          />
        )}
      </FormField>
      <Button
        variant="secondary"
        disabled={!csv.trim() || locked}
        busy={loading}
        onClick={() => void preview()}
      >
        {t("preview")}
      </Button>
      {error && (
        <StatePanel
          error
          title={t(error)}
          action={
            <Button variant="secondary" onClick={() => void preview()}>
              {t("retry")}
            </Button>
          }
        />
      )}
      {review && (
        <div className="space-y-4">
          <p className="text-sm">
            {t("importReview", {
              total: review.rows.length,
              selected: review.rows.length - skipRows.length,
            })}
          </p>
          <DataTable
            items={review.rows}
            caption={t("importTitle")}
            emptyTitle={t("importError")}
            rowKey={(row) => String(row.index)}
            columns={[
              {
                key: "person",
                title: t("person"),
                render: (row) => (
                  <span>
                    {[row.data.firstName, row.data.lastName]
                      .filter(Boolean)
                      .join(" ") || row.data.phone}
                    <span className="block text-xs text-muted">
                      {row.data.phone} {row.data.email}
                    </span>
                  </span>
                ),
              },
              {
                key: "consent",
                title: t("consent"),
                render: (row) => t(row.data.consentContact ? "yes" : "no"),
              },
              {
                key: "duplicate",
                title: t("duplicates"),
                render: (row) =>
                  row.duplicateIds.length + row.duplicateRows.length,
              },
              {
                key: "skip",
                title: t("skip"),
                render: (row) => (
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={skipRows.includes(row.index)}
                      onChange={(event) =>
                        setSkipRows((previous) =>
                          event.target.checked
                            ? [...previous, row.index]
                            : previous.filter((index) => index !== row.index),
                        )
                      }
                    />
                    {t("skipRow", { row: row.index + 1 })}
                  </label>
                ),
              },
            ]}
            renderMobileSummary={(row) => (
              <div className="space-y-2">
                <p>
                  {[row.data.firstName, row.data.lastName, row.data.phone]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p>
                  {t("consent")}: {t(row.data.consentContact ? "yes" : "no")}
                </p>
                <p>
                  {t("duplicates")}:{" "}
                  {row.duplicateIds.length + row.duplicateRows.length}
                </p>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={skipRows.includes(row.index)}
                    onChange={(event) =>
                      setSkipRows((previous) =>
                        event.target.checked
                          ? [...previous, row.index]
                          : previous.filter((index) => index !== row.index),
                      )
                    }
                  />
                  {t("skipRow", { row: row.index + 1 })}
                </label>
              </div>
            )}
          />
          <Button
            busy={mutation.busy}
            disabled={
              skipRows.length === review.rows.length || mutation.success
            }
            onClick={() =>
              void mutation.submit({
                rows: review.rows.map((row) => row.data),
                reviewToken: review.reviewToken,
                skipRows,
              })
            }
          >
            {t(mutation.pending ? "recover" : "confirmImport")}
          </Button>
        </div>
      )}
      {mutation.error && <StatePanel error title={t(mutation.error)} />}
      {mutation.success && (
        <output className="block text-sm">{t("importSuccess")}</output>
      )}
    </Surface>
  );
}
