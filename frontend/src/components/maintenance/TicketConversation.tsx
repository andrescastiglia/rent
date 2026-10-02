"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { maintenanceApi } from "@/lib/api/maintenance";
import type { MaintenanceTicketComment } from "@/types/maintenance";
import { useWorkflowMutation } from "@/hooks/useWorkflowMutation";
import { Button, FormField, StatePanel } from "@/components/ui";
export default function TicketConversation({
  ticketId,
}: Readonly<{ ticketId: string }>) {
  const t = useTranslations("tenantMaintenance"),
    locale = useLocale();
  const [comments, setComments] = useState<MaintenanceTicketComment[]>([]),
    [body, setBody] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  const mutation = useWorkflowMutation((request: { body: string }) =>
    maintenanceApi.addComment(ticketId, request.body, false),
  );
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    maintenanceApi
      .getComments(ticketId)
      .then((result) => {
        if (!cancelled)
          setComments(result.filter((comment) => !comment.isInternal));
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
  }, [ticketId, revision]);
  async function submit() {
    if (await mutation.submit({ body: body.trim() })) {
      setRevision((value) => value + 1);
    }
  }
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{t("comments")}</h3>
      {loading && <StatePanel busy title={t("loading")} />}
      {error && (
        <StatePanel
          error
          title={t("commentsError")}
          action={
            <Button
              variant="secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t("retry")}
            </Button>
          }
        />
      )}
      <ul className="space-y-3">
        {comments.map((comment) => (
          <li
            key={comment.id}
            className="rounded-md border border-line p-3 text-sm"
          >
            <p className="whitespace-pre-wrap break-words">{comment.body}</p>
            <p className="mt-2 text-xs text-muted">
              {[comment.user?.firstName, comment.user?.lastName]
                .filter(Boolean)
                .join(" ")}{" "}
              · {new Date(comment.createdAt).toLocaleString(locale)}
            </p>
          </li>
        ))}
      </ul>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField
          id={`ticket-comment-${ticketId}`}
          label={t("newComment")}
          help={t("commentHelp")}
        >
          {(attributes) => (
            <textarea
              {...attributes}
              className="ui-field"
              required
              disabled={mutation.busy || Boolean(mutation.pending)}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                mutation.reset();
              }}
            />
          )}
        </FormField>
        <Button
          type="submit"
          disabled={!body.trim() || mutation.success}
          busy={mutation.busy}
        >
          {t(mutation.pending ? "recover" : "sendComment")}
        </Button>
      </form>
      {mutation.error && <StatePanel error title={t(mutation.error)} />}
      {mutation.success && (
        <output className="block text-sm">{t("commentSuccess")}</output>
      )}
    </section>
  );
}
