"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { contactApi } from "@/lib/api/contact-data";
import {
  mapsUrl,
  type Eta,
  type GeoDestination,
  type LocationRef,
  type TravelMode,
} from "@/lib/contact-types";
export function GeoCard({
  location,
  entryId,
  autoEstimate = false,
}: {
  location?: LocationRef;
  entryId?: string;
  autoEstimate?: boolean;
}) {
  const { user } = useAuth();
  const host = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const [visible, setVisible] = useState(false),
    [point, setPoint] = useState<GeoDestination | null>(null),
    [image, setImage] = useState(""),
    [imageError, setImageError] = useState(""),
    [eta, setEta] = useState<Eta | null>(null),
    [error, setError] = useState(""),
    [mode, setMode] = useState<TravelMode>("driving"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const type = location?.type,
    id = location?.id;
  useEffect(() => {
    if (!visible) return;
    ++generation.current;
    setBusy(false);
    let active = true;
    const abort = new AbortController();
    let url = "";
    setPoint(null);
    setImage("");
    setImageError("");
    setEta(null);
    setError("");
    void (async () => {
      try {
        if (!(await contactApi.config()).maps) return;
        const destination = entryId
          ? await contactApi.entry(entryId)
          : type && id
            ? await contactApi.destination({ type, id })
            : null;
        if (!active || !destination) return;
        setPoint(destination);
        try {
          url = await contactApi.image(destination, abort.signal);
          if (active) setImage(url);
          else URL.revokeObjectURL(url);
        } catch {
          if (active) setImageError("Imagen temporalmente no disponible");
        }
      } catch {
        /* Addresses without a point have no map. */
      }
    })();
    return () => {
      active = false;
      ++generation.current;
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [visible, type, id, entryId, user?.id, user?.companyId]);
  const estimate = useCallback(
    async (selected: TravelMode) => {
      if (!point) return;
      const version = generation.current;
      setBusy(true);
      setError("");
      setEta(null);
      try {
        if (!navigator.geolocation) throw new Error();
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 12000,
              maximumAge: 30000,
            }),
        );
        const result = await contactApi.eta(
          point,
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          },
          selected,
        );
        if (generation.current === version) setEta(result);
      } catch {
        if (generation.current === version)
          setError(
            "No se pudo obtener el tiempo de llegada. Podés usar Ir ahí.",
          );
      } finally {
        if (generation.current === version) setBusy(false);
      }
    },
    [point],
  );
  const estimated = useRef("");
  useEffect(() => {
    if (
      autoEstimate &&
      point &&
      estimated.current !== `${point.type}:${point.id}`
    ) {
      estimated.current = `${point.type}:${point.id}`;
      void estimate("driving");
    }
  }, [autoEstimate, point, estimate]);
  return (
    <div ref={host}>
      {point && (
        <section
          className="my-4 space-y-3 rounded border p-4"
          aria-label="Ubicación y navegación"
        >
          <p className="font-medium">{point.address}</p>
          {!point.precise && (
            <p>Ubicación aproximada; confirmá el domicilio antes de visitar.</p>
          )}
          {image ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void estimate(mode)}
              aria-label="Calcular tiempo de llegada"
              className="block w-full"
            >
              {/* Inline blob image avoids persistent optimization caches. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt={`Ubicación de ${point.name}`}
                className="w-full rounded"
              />
            </button>
          ) : (
            <p role="status">{imageError || "Cargando imagen…"}</p>
          )}
          <a
            className="text-xs underline"
            href="https://www.esri.com/en-us/legal/terms/data-attributions"
            target="_blank"
            rel="noopener noreferrer"
          >
            Esri y proveedores de imágenes
          </a>
          <div className="flex flex-wrap gap-3">
            <select
              disabled={busy}
              aria-label="Medio de traslado"
              value={mode}
              onChange={(e) => {
                const selected = e.target.value as TravelMode;
                setMode(selected);
                setEta(null);
                void estimate(selected);
              }}
            >
              <option value="driving">Auto</option>
              <option value="walking">Caminata</option>
              <option value="cycling">Bicicleta</option>
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => void estimate(mode)}
            >
              {busy ? "Calculando…" : "Calcular llegada"}
            </button>
            <a
              className="underline"
              href={mapsUrl(
                point,
                mode,
                typeof navigator !== "undefined" &&
                  /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ir ahí
            </a>
          </div>
          {eta && (
            <p role="status">
              {Math.max(1, Math.round(eta.durationSeconds / 60))} min · Llegada
              estimada{" "}
              {new Date(eta.arrivesAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · Sin tráfico en tiempo real
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {eta && <p className="text-xs">{eta.attribution}</p>}
        </section>
      )}
    </div>
  );
}
