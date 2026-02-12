import { redirect } from "next/navigation";

type LeaseTemplatesLegacyPageProps = {
  params: {
    locale: string;
  };
};

export default function LeaseTemplatesLegacyPage({
  params,
}: LeaseTemplatesLegacyPageProps) {
  redirect(`/${params.locale}/templates`);
}
