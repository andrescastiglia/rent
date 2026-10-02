"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/auth-context";
import {
  Button,
  FormField,
  RemoteSelect,
  StatePanel,
  Surface,
} from "@/components/ui";
import { interestedWorkflowApi } from "@/lib/api/interested-workflow";
import {
  parsePipelineStages,
  type PipelineStage,
} from "@/lib/interested-import";
import { useWorkflowMutation } from "@/hooks/useWorkflowMutation";
import { loadInterestedOptions } from "./MergeContactsPanel";

function PipelineConfiguration({
  stages,
  onSaved,
}: Readonly<{ stages: PipelineStage[]; onSaved: () => void }>) {
  const t = useTranslations("crmWorkflow");
  const [text, setText] = useState(
    stages.map((stage) => `${stage.id}|${stage.label}`).join("\n"),
  );
  const [review, setReview] = useState<PipelineStage[]>();
  const [invalid, setInvalid] = useState(false);
  const mutation = useWorkflowMutation(interestedWorkflowApi.configurePipeline);
  const locked = mutation.busy || Boolean(mutation.pending);

  return (
    <details className="space-y-4 rounded-lg border border-line p-4">
      <summary className="min-h-11 cursor-pointer font-medium">
        {t("configure")}
      </summary>
      <p className="mt-3 text-sm text-muted">{t("configureHelp")}</p>
      <label htmlFor="crm-pipeline-stages" className="sr-only">
        {t("stages")}
      </label>
      <textarea
        id="crm-pipeline-stages"
        className="ui-field min-h-32 font-mono text-sm"
        disabled={locked}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setReview(undefined);
          setInvalid(false);
          mutation.reset();
        }}
      />
      <Button
        variant="secondary"
        disabled={locked}
        onClick={() => {
          try {
            setReview(parsePipelineStages(text));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      >
        {t("preview")}
      </Button>
      {invalid && <StatePanel error title={t("configError")} />}
      {review && (
        <div className="space-y-3">
          <p className="text-sm">
            {review.map((stage) => stage.label).join(" → ")}
          </p>
          <Button
            busy={mutation.busy}
            disabled={mutation.success}
            onClick={() =>
              void mutation.submit({ stages: review }).then((saved) => {
                if (saved) onSaved();
              })
            }
          >
            {t(mutation.pending ? "recover" : "confirmConfiguration")}
          </Button>
        </div>
      )}
      {mutation.error && <StatePanel error title={t(mutation.error)} />}
      {mutation.success && (
        <output className="block text-sm">{t("configSuccess")}</output>
      )}
    </details>
  );
}

export default function PipelinePanel() {
  const t = useTranslations("crmWorkflow");
  const { user } = useAuth();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [profileId, setProfileId] = useState("");
  const [stageId, setStageId] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const mutation = useWorkflowMutation(interestedWorkflowApi.move);
  const locked = mutation.busy || Boolean(mutation.pending);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    interestedWorkflowApi
      .pipeline()
      .then((result) => {
        if (!cancelled) setStages(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  let submitLabel = "preview";
  if (reviewing) submitLabel = "confirmMove";
  if (mutation.pending) submitLabel = "recover";
  const admin = user?.role === "admin" || user?.roles?.includes("admin");
  let content = <StatePanel busy title={t("loading")} />;
  if (error)
    content = (
      <StatePanel
        error
        title={t("pipelineError")}
        action={
          <Button
            variant="secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("retry")}
          </Button>
        }
      />
    );
  else if (!loading)
    content = (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {stages.map((stage) => stage.label).join(" → ")}
        </p>
        <RemoteSelect
          id="crm-pipeline-person"
          label={t("person")}
          value={profileId}
          load={loadInterestedOptions}
          disabled={locked}
          required
          onChange={(value) => {
            setProfileId(value);
            setReviewing(false);
            mutation.reset();
          }}
        />
        <FormField id="crm-pipeline-stage" label={t("stage")}>
          {(attributes) => (
            <select
              {...attributes}
              className="ui-field"
              value={stageId}
              required
              disabled={locked}
              onChange={(event) => {
                setStageId(event.target.value);
                setReviewing(false);
                mutation.reset();
              }}
            >
              <option value="">{t("chooseStage")}</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {reviewing && (
          <p className="text-sm">
            {t("moveReview", {
              stage:
                stages.find((stage) => stage.id === stageId)?.label ?? stageId,
            })}
          </p>
        )}
        <Button
          busy={mutation.busy}
          disabled={!profileId || !stageId || mutation.success}
          onClick={() => {
            if (!reviewing) setReviewing(true);
            else void mutation.submit({ profileId, stageId });
          }}
        >
          {t(submitLabel)}
        </Button>
        {mutation.error && <StatePanel error title={t(mutation.error)} />}
        {mutation.success && (
          <output className="block text-sm">{t("moveSuccess")}</output>
        )}
        {admin && (
          <PipelineConfiguration
            stages={stages}
            onSaved={() => setRevision((value) => value + 1)}
          />
        )}
      </div>
    );
  return (
    <Surface className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{t("pipelineTitle")}</h2>
      {content}
    </Surface>
  );
}
