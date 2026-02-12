import { redirect } from "next/navigation";

type TenantPaymentsIndexPageProps = {
  params: {
    locale: string;
    id: string;
  };
};

export default function TenantPaymentsIndexPage({
  params,
}: TenantPaymentsIndexPageProps) {
  redirect(`/${params.locale}/tenants/${params.id}/payments/new`);
}
