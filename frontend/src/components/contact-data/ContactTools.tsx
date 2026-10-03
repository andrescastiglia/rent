"use client";
import { useEffect, useId, useRef, useState } from "react";
import { contactApi } from "@/lib/api/contact-data";
import type {
  AddressCandidate,
  ContactAddress,
  ContactInput,
  PhoneField,
  PhonePreview,
} from "../../../../shared/contact-data";
import { emptyContactAddress } from "../../../../shared/contact-data";
export function ContactTools({
  value,
  onChange,
  phones = {},
  address,
  editAddress = false,
  initialAddress,
}: Readonly<{
  value: ContactInput;
  onChange: (next: ContactInput) => void;
  phones?: Partial<Record<PhoneField, string>>;
  address?: ContactAddress;
  editAddress?: boolean;
  initialAddress?: ContactAddress | null;
}>) {
  const id = useId();
  const [enabled, setEnabled] = useState(false);
  const [country, setCountry] = useState("AR");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicAddress, setPublicAddress] = useState(false);
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [preview, setPreview] = useState<{
    field: PhoneField;
    phone: PhonePreview;
  } | null>(null);
  const acceptedAddress = useRef<string | null>(null);
  const current =
    address ?? value.contactAddress ?? initialAddress ?? emptyContactAddress();
  const addressKey = JSON.stringify(
    ["street", "number", "city", "state", "country", "postalCode"].map((k) =>
      String(current[k as keyof ContactAddress] ?? "")
        .trim()
        .toLowerCase(),
    ),
  );
  useEffect(() => {
    if (
      value.normalization?.addressToken &&
      acceptedAddress.current !== null &&
      acceptedAddress.current !== addressKey
    ) {
      onChange({
        ...value,
        normalization: { ...value.normalization, addressToken: undefined },
      });
      setCandidates([]);
    }
  }, [addressKey, value, onChange]);
  useEffect(() => {
    let active = true;
    contactApi
      .config()
      .then((c) => {
        if (active) setEnabled(c?.normalization ?? false);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo normalizar");
    } finally {
      setBusy(false);
    }
  };
  if (!enabled && !editAddress) return null;
  return (
    <fieldset
      className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
      disabled={busy}
    >
      <legend className="px-2 font-medium">Datos de contacto · opcional</legend>
      {editAddress && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              "street",
              "number",
              "city",
              "state",
              "country",
              "postalCode",
              "floor",
              "apartment",
            ] as const
          ).map((field) => (
            <label key={field} htmlFor={`${id}-${field}`} className="text-sm">
              {
                {
                  street: "Calle",
                  number: "Número",
                  city: "Ciudad",
                  state: "Provincia",
                  country: "País",
                  postalCode: "Código postal",
                  floor: "Piso",
                  apartment: "Departamento",
                }[field]
              }
              <input
                id={`${id}-${field}`}
                className="block w-full rounded border p-2 dark:bg-gray-800"
                value={current[field] ?? ""}
                onChange={(e) => {
                  onChange({
                    ...value,
                    contactAddress: { ...current, [field]: e.target.value },
                    normalization: {
                      ...value.normalization,
                      addressToken:
                        field === "floor" || field === "apartment"
                          ? value.normalization?.addressToken
                          : undefined,
                    },
                  });
                  setCandidates([]);
                }}
              />
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={current.confidential}
              onChange={(e) =>
                onChange({
                  ...value,
                  contactAddress: {
                    ...current,
                    confidential: e.target.checked,
                  },
                  normalization: {
                    ...value.normalization,
                    addressToken: undefined,
                  },
                })
              }
            />{" "}
            Domicilio confidencial
          </label>
        </div>
      )}
      {enabled && (
        <>
          {Object.keys(phones).length > 0 && (
            <>
              <label htmlFor={`${id}-country`}>
                País del teléfono
                <select
                  id={`${id}-country`}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="ml-2 rounded border p-2 dark:bg-gray-800"
                >
                  {[
                    "AR",
                    "UY",
                    "BR",
                    "CL",
                    "PY",
                    "BO",
                    "PE",
                    "CO",
                    "EC",
                    "VE",
                    "MX",
                    "US",
                    "CA",
                    "ES",
                    "IT",
                    "FR",
                    "DE",
                    "GB",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Otro país (ISO)
                <input
                  aria-label="Código de país telefónico"
                  maxLength={2}
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  className="ml-2 w-16 rounded border p-2 dark:bg-gray-800"
                />
              </label>
              {Object.entries(phones).map(([field, number]) => (
                <div key={field} className="flex flex-wrap items-center gap-2">
                  <span>
                    {field === "ownerWhatsapp"
                      ? "WhatsApp propietario"
                      : field.includes("emergency")
                        ? "Teléfono de emergencia"
                        : "Teléfono"}
                    : {number || "Sin teléfono"}
                  </span>
                  <button
                    type="button"
                    disabled={!number?.trim() || busy}
                    className="rounded border px-3 py-2"
                    onClick={() =>
                      void run(async () => {
                        const phone = await contactApi.phone(
                          number ?? "",
                          country,
                        );
                        setPreview({ field: field as PhoneField, phone });
                      })
                    }
                  >
                    Normalizar teléfono
                  </button>
                  {value.normalization?.phones?.[field as PhoneField] && (
                    <span>Se normalizará al guardar</span>
                  )}
                </div>
              ))}
            </>
          )}
          {preview && (
            <div role="status" className="rounded border p-3">
              {preview.phone.valid ? (
                <>
                  <p>
                    {preview.phone.international}
                    {preview.phone.extension
                      ? ` · interno ${preview.phone.extension}`
                      : ""}
                  </p>
                  <button
                    type="button"
                    className="rounded border px-3 py-2"
                    onClick={() => {
                      if (phones[preview.field] !== preview.phone.original) {
                        setError("El teléfono cambió. Volvé a normalizar.");
                        setPreview(null);
                        return;
                      }
                      onChange({
                        ...value,
                        normalization: {
                          ...value.normalization,
                          phones: {
                            ...value.normalization?.phones,
                            [preview.field]: preview.phone.country,
                          },
                          phoneOriginals: {
                            ...value.normalization?.phoneOriginals,
                            [preview.field]: preview.phone.original,
                          },
                        },
                      });
                      setPreview(null);
                    }}
                  >
                    Aceptar teléfono
                  </button>
                </>
              ) : (
                <p>
                  Completá país, código de área y teléfono.{" "}
                  {preview.phone.possible
                    ? "El número es posible, pero no válido."
                    : "El número está incompleto o no es válido."}
                </p>
              )}
            </div>
          )}
          {(address || editAddress) && (
            <>
              <label className="block">
                <input
                  type="checkbox"
                  checked={publicAddress}
                  onChange={(e) => setPublicAddress(e.target.checked)}
                />{" "}
                Esta dirección es pública y no contiene datos personales ni
                confidenciales.
              </label>
              <button
                type="button"
                disabled={
                  !publicAddress ||
                  current.confidential ||
                  !current.street.trim() ||
                  !current.city.trim()
                }
                className="rounded border px-3 py-2"
                onClick={() =>
                  void run(async () => {
                    const result = await contactApi.search(current);
                    setCandidates(result.candidates);
                    if (!result.candidates.length)
                      setError(
                        "No se encontraron direcciones. Podés guardar los datos originales.",
                      );
                  })
                }
              >
                Normalizar dirección
              </button>
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.token}
                  className="block w-full rounded border p-2 text-left"
                  onClick={() => {
                    acceptedAddress.current = addressKey;
                    onChange({
                      ...value,
                      normalization: {
                        ...value.normalization,
                        addressToken: c.token,
                      },
                    });
                    setCandidates([]);
                  }}
                >
                  {c.label}
                  {!c.precise ? " · ubicación aproximada" : ""}
                </button>
              ))}
              {value.normalization?.addressToken && (
                <p role="status">
                  Dirección seleccionada. Se guardará junto con el registro.
                </p>
              )}
              <a
                className="text-xs underline"
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                © OpenStreetMap contributors
              </a>
            </>
          )}
        </>
      )}
      {busy && <p role="status">Normalizando…</p>}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
