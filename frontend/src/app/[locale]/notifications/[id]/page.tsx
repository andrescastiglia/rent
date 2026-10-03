"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import MainLayout from "@/components/layout/MainLayout";
import { GeoCard } from "@/components/contact-data/GeoCard";
import { noticesApi } from "@/lib/api/agenda";
import { contactApi } from "@/lib/api/contact-data";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
function Destination() {
  const { id } = useParams<{ id: string }>(),
    router = useLocalizedRouter();
  const [error, setError] = useState(""),
    [visit, setVisit] = useState<{ entryId: string; path: string } | null>(
      null,
    );
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const target = await noticesApi.destination(id);
        await noticesApi.read(id);
        if (
          target.kind === "visit" &&
          target.entryId &&
          (await contactApi.config()).maps
        ) {
          let destination = null;
          try {
            destination = await contactApi.entry(target.entryId);
          } catch {
            /* Keep the original notification destination if maps are unavailable. */
          }
          if (active && destination) {
            setVisit({ entryId: target.entryId, path: target.path });
            return;
          }
        }
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
  return visit ? (
    <div>
      <GeoCard entryId={visit.entryId} autoEstimate />
      <button type="button" onClick={() => router.replace(visit.path)}>
        Abrir seguimiento de la visita
      </button>
    </div>
  ) : error ? (
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
