"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { noticesApi } from "@/lib/api/agenda";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
function Destination() {
  const { id } = useParams<{ id: string }>();
  const router = useLocalizedRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const target = await noticesApi.destination(id);
        await noticesApi.read(id);
        if (active) router.replace(target.path);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "No se pudo abrir el aviso",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router.replace]);
  return error ? (
    <p role="alert">{error}</p>
  ) : (
    <p role="status">Abriendo seguimiento…</p>
  );
}
export default function Page() {
  return (
    <MainLayout>
      <Destination />
    </MainLayout>
  );
}
