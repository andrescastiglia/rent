"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import AgendaDetail from "@/components/agenda/AgendaDetail";
function Detail() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const query = useSearchParams();
  return (
    <AgendaDetail
      personType={type}
      personId={id}
      id={query.get("entry") ?? undefined}
    />
  );
}
export default function Page() {
  return (
    <MainLayout>
      <Suspense>
        <Detail />
      </Suspense>
    </MainLayout>
  );
}
