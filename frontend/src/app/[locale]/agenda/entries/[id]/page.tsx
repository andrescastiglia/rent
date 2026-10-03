"use client";
import { useParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import AgendaDetail from "@/components/agenda/AgendaDetail";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <MainLayout>
      <AgendaDetail id={id} />
    </MainLayout>
  );
}
