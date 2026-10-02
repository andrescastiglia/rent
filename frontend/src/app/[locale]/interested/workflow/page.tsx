"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui";
import ImportContactsPanel from "@/components/interested/ImportContactsPanel";
import MergeContactsPanel from "@/components/interested/MergeContactsPanel";
import PipelinePanel from "@/components/interested/PipelinePanel";

export default function InterestedWorkflowPage() {
  const t = useTranslations("crmWorkflow"),
    locale = useLocale();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link className="btn btn-secondary" href={`/${locale}/interested`}>
            {t("back")}
          </Link>
        }
      />
      <PipelinePanel />
      <ImportContactsPanel />
      <MergeContactsPanel />
    </div>
  );
}
