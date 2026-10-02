import { redirect } from "next/navigation";

type TenantPaymentsIndexPageProps = {
  params: Promise<{
    locale: string;
    id: string;
  }>;
};

export default async function TenantPaymentsIndexPage({
  params,
}: TenantPaymentsIndexPageProps) {
  const { locale, id } = await params;
  redirect(`/${locale}/tenants/${id}/payments/new`);
}
