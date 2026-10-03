"use client";
import { useState } from "react";
import { contactApi } from "@/lib/api/contact-data";
import type { LocationRef } from "@/lib/contact-types";
export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationRef | null;
  onChange: (value: LocationRef | null) => void;
}) {
  const [search, setSearch] = useState(""),
    [places, setPlaces] = useState<
      Array<LocationRef & { name: string; address: string }>
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setPlaces(await contactApi.places(search));
    } catch {
      setError("No se pudieron cargar los lugares");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="space-y-2">
      <legend>Destino de la visita</legend>
      <p>Sin selección, se usa el domicilio de la persona vinculada.</p>
      <input
        aria-label="Buscar lugar registrado"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button type="button" disabled={busy} onClick={() => void load()}>
        Buscar lugares
      </button>
      <select
        aria-label="Lugar registrado"
        value={value ? `${value.type}:${value.id}` : ""}
        onChange={(e) => {
          const place = places.find(
            (p) => `${p.type}:${p.id}` === e.target.value,
          );
          onChange(place ? { type: place.type, id: place.id } : null);
        }}
      >
        <option value="">Domicilio del contacto</option>
        {value &&
          !places.some((p) => p.type === value.type && p.id === value.id) && (
            <option value={`${value.type}:${value.id}`}>
              Destino registrado
            </option>
          )}
        {places.map((p) => (
          <option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>
            {p.name} · {p.address} · {p.type}
          </option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
