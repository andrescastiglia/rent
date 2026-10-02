"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, RemoteSelect, StatePanel, Surface } from "@/components/ui";
import { interestedApi } from "@/lib/api/interested";
import {
  interestedWorkflowApi,
  type MergeReview,
} from "@/lib/api/interested-workflow";
import { useWorkflowMutation } from "@/hooks/useWorkflowMutation";

export async function loadInterestedOptions(search: string, page: number) {
  const result = await interestedApi.getAll({ name: search, page, limit: 20 });
  return {
    ...result,
    data: result.data.map((person) => ({
      value: person.id,
      label: [person.firstName, person.lastName, person.phone]
        .filter(Boolean)
        .join(" · "),
    })),
  };
}
export default function MergeContactsPanel() {
  const t = useTranslations("crmWorkflow");
  const [targetId, setTargetId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [review, setReview] = useState<MergeReview>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const mutation = useWorkflowMutation(interestedWorkflowApi.merge);
  const locked = mutation.busy || Boolean(mutation.pending);
  async function preview() {
    mutation.reset();
    setLoading(true);
    setError(false);
    setReview(undefined);
    setAcknowledged(false);
    try {
      setReview(
        await interestedWorkflowApi.previewMerge({ targetId, sourceId }),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  function change(kind: "target" | "source", value: string) {
    if (kind === "target") setTargetId(value);
    else setSourceId(value);
    setReview(undefined);
    setAcknowledged(false);
  }
  return (
    <Surface className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t("mergeTitle")}</h2>
      <p className="text-sm text-muted">{t("mergeDescription")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <RemoteSelect
          id="crm-merge-target"
          label={t("target")}
          value={targetId}
          onChange={(value) => change("target", value)}
          load={loadInterestedOptions}
          disabled={locked || loading}
          required
        />
        <RemoteSelect
          id="crm-merge-source"
          label={t("source")}
          value={sourceId}
          onChange={(value) => change("source", value)}
          load={loadInterestedOptions}
          disabled={locked || loading}
          required
        />
      </div>
      <Button
        variant="secondary"
        busy={loading}
        disabled={locked || !targetId || !sourceId || targetId === sourceId}
        onClick={() => void preview()}
      >
        {t("preview")}
      </Button>
      {error && (
        <StatePanel
          error
          title={t("mergeError")}
          action={
            <Button variant="secondary" onClick={() => void preview()}>
              {t("retry")}
            </Button>
          }
        />
      )}
      {review && (
        <div className="space-y-4 rounded-lg border border-line p-4">
          {review.people.map((person, index) => (
            <div key={person.id}>
              <h3 className="font-medium">
                {t(index === 0 ? "target" : "source")}:{" "}
                {[person.first_name, person.last_name]
                  .filter(Boolean)
                  .join(" ")}
              </h3>
              <p className="text-sm break-words">
                {person.phone} · {person.email || "—"}
              </p>
              <p className="text-sm">
                {t("consent")}: {t(person.consent_contact ? "yes" : "no")}
              </p>
            </div>
          ))}
          <ul className="list-disc pl-5 text-sm">
            {review.impact.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
          <p className="text-sm">
            {t("related", {
              total: Object.values(review.related).reduce(
                (sum, rows) => sum + rows.length,
                0,
              ),
            })}
          </p>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              disabled={locked}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            {t("mergeAcknowledgement")}
          </label>
          <Button
            variant="danger"
            busy={mutation.busy}
            disabled={!acknowledged || mutation.success}
            onClick={() =>
              void mutation.submit({
                targetId,
                sourceId,
                reviewToken: review.reviewToken,
              })
            }
          >
            {t(mutation.pending ? "recover" : "confirmMerge")}
          </Button>
        </div>
      )}
      {mutation.error && <StatePanel error title={t(mutation.error)} />}
      {mutation.success && (
        <output className="block text-sm">{t("mergeSuccess")}</output>
      )}
    </Surface>
  );
}
