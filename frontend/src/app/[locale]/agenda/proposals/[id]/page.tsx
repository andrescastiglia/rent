"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import MainLayout from "@/components/layout/MainLayout";
import { RoleGuard } from "@/components/common/RoleGuard";
import PendingActionReviewDialog from "@/components/ai/PendingActionReviewDialog";
import { Button } from "@/components/ui";
import { apiClient } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { dashboardApi } from "@/lib/api/dashboard";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
type Proposal = {
  id: string;
  summary: string;
  status: string;
  canRetry: boolean;
  errorMessage?: string | null;
  result?: { id?: string };
};
function Detail() {
  const { id } = useParams<{ id: string }>(),
    router = useLocalizedRouter(),
    t = useTranslations("dashboard");
  const [proposal, setProposal] = useState<Proposal>(),
    [open, setOpen] = useState(true),
    [password, setPassword] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    apiClient
      .get<Proposal>(
        `/pending-actions/${encodeURIComponent(id)}`,
        getToken() ?? undefined,
      )
      .then((p) => {
        if (active) setProposal(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const actionable =
    proposal && (proposal.status === "pending" || proposal.canRetry);
  async function approve() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await dashboardApi.reauthenticate(password);
      await dashboardApi.approvePendingAction(id, token);
      const current = await apiClient.get<Proposal>(
        `/pending-actions/${encodeURIComponent(id)}`,
        getToken() ?? undefined,
      );
      setProposal(current);
      if (current.status !== "executed")
        throw new Error(
          current.errorMessage ?? t("peopleActivity.approveError"),
        );
      setOpen(false);
      setPassword("");
      if (current.result?.id?.startsWith("task:"))
        router.replace(
          `/agenda/entries/${encodeURIComponent(current.result.id)}`,
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("peopleActivity.approveError"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function reject() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await dashboardApi.rejectPendingAction(id);
      setProposal((p) =>
        p ? { ...p, status: "rejected", canRetry: false } : p,
      );
      setOpen(false);
      setPassword("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("peopleActivity.approveError"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {proposal?.summary ?? t("peopleActivity.reauthTitle")}
      </h1>
      {error && <p role="alert">{error}</p>}
      {proposal && <p>{proposal.status}</p>}
      {actionable && (
        <div className="flex gap-3">
          <Button onClick={() => setOpen(true)} disabled={busy}>
            {t("peopleActivity.actions.approve")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void reject()}
            disabled={busy}
          >
            {t("peopleActivity.actions.reject")}
          </Button>
        </div>
      )}
      <PendingActionReviewDialog
        item={
          open && actionable
            ? {
                actionId: id,
                subject: proposal.summary,
                canRetry: proposal.canRetry,
              }
            : null
        }
        password={password}
        error={error}
        busy={busy}
        onPasswordChange={setPassword}
        onCancel={() => {
          setOpen(false);
          setPassword("");
        }}
        onConfirm={() => void approve()}
      />
    </section>
  );
}
export default function Page() {
  return (
    <MainLayout>
      <RoleGuard allowedRoles={["admin", "staff"]} requiredModule="approvals">
        <Detail />
      </RoleGuard>
    </MainLayout>
  );
}
