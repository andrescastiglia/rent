import { redirect } from "next/navigation";

type LeaseTemplatesLegacyPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function LeaseTemplatesLegacyPage({
  params,
}: LeaseTemplatesLegacyPageProps) {
  const { locale } = await params;
  redirect(`/${locale}/templates`);
}
