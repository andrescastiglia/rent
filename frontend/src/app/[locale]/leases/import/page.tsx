"use client";

import { CurrencySelect } from "@/components/common/CurrencySelect";
import { useAuth } from "@/contexts/auth-context";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { buyersApi } from "@/lib/api/buyers";
import { interestedApi } from "@/lib/api/interested";
import { leasesApi } from "@/lib/api/leases";
import { ownersApi } from "@/lib/api/owners";
import { propertiesApi } from "@/lib/api/properties";
import { ContractType, ImportCurrentLeaseInput, Lease } from "@/types/lease";
import type { Buyer } from "@/types/buyer";
import { Owner } from "@/types/owner";
import { Property } from "@/types/property";
import { InterestedProfile } from "@/types/interested";
import Link from "next/link";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { useLocale } from "next-intl";
import { type SyntheticEvent, useEffect, useMemo, useState } from "react";

type QuickPartyOption = {
  id: string;
  label: string;
  source: "tenant" | "buyer" | "interested";
  tenantId?: string;
  buyerId?: string;
  profileId: string;
};

type QuickInterestedFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

const INTERESTED_TENANT_PREFIX = "interested:";
const INTERESTED_BUYER_PREFIX = "interested-buyer:";

function getProfileOperations(profile: InterestedProfile): string[] {
  return profile.operations ?? (profile.operation ? [profile.operation] : []);
}

function buildRentalPartyOptions(
  profiles: InterestedProfile[],
): QuickPartyOption[] {
  return profiles
    .filter((profile) => getProfileOperations(profile).includes("rent"))
    .map((profile) => ({
      id: profile.convertedToTenantId
        ? profile.convertedToTenantId
        : `${INTERESTED_TENANT_PREFIX}${profile.id}`,
      source: profile.convertedToTenantId ? "tenant" : "interested",
      tenantId: profile.convertedToTenantId,
      profileId: profile.id,
      label:
        `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ||
        profile.phone,
    }));
}

function buildSalePartyOptions(
  profiles: InterestedProfile[],
  buyers: Buyer[],
): QuickPartyOption[] {
  const mappedBuyers = buyers.map((buyer) => ({
    id: buyer.id,
    buyerId: buyer.id,
    profileId: buyer.interestedProfileId ?? buyer.id,
    source: "buyer" as const,
    label:
      `${buyer.firstName ?? ""} ${buyer.lastName ?? ""}`.trim() ||
      buyer.phone ||
      buyer.email ||
      buyer.id,
  }));
  const knownBuyerIds = new Set(mappedBuyers.map((buyer) => buyer.id));

  const convertedProfiles = profiles
    .filter(
      (profile) =>
        getProfileOperations(profile).includes("sale") &&
        Boolean(profile.convertedToBuyerId) &&
        !knownBuyerIds.has(profile.convertedToBuyerId as string),
    )
    .map((profile) => ({
      id: profile.convertedToBuyerId as string,
      buyerId: profile.convertedToBuyerId as string,
      profileId: profile.id,
      source: "buyer" as const,
      label:
        `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ||
        profile.phone,
    }));

  const interestedOnly = profiles
    .filter(
      (profile) =>
        getProfileOperations(profile).includes("sale") &&
        !profile.convertedToBuyerId,
    )
    .map((profile) => ({
      id: `${INTERESTED_BUYER_PREFIX}${profile.id}`,
      source: "interested" as const,
      profileId: profile.id,
      label:
        `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ||
        profile.phone,
    }));

  return [...mappedBuyers, ...convertedProfiles, ...interestedOnly];
}

export default function ImportCurrentLeasePage() {
  const locale = useLocale();
  const router = useLocalizedRouter();
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [profiles, setProfiles] = useState<InterestedProfile[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [allLeases, setAllLeases] = useState<Lease[]>([]);
  const [showQuickInterestedForm, setShowQuickInterestedForm] = useState(false);
  const [creatingInterested, setCreatingInterested] = useState(false);
  const [quickInterestedForm, setQuickInterestedForm] =
    useState<QuickInterestedFormState>({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
    });
  const [form, setForm] = useState<{
    contractType: ContractType;
    propertyId: string;
    ownerId: string;
    partyId: string;
    startDate: string;
    endDate: string;
    rentAmount: string;
    depositAmount: string;
    fiscalValue: string;
    currency: string;
    notes: string;
    file: File | null;
  }>({
    contractType: "rental",
    propertyId: "",
    ownerId: "",
    partyId: "",
    startDate: "",
    endDate: "",
    rentAmount: "",
    depositAmount: "",
    fiscalValue: "",
    currency: "ARS",
    notes: "",
    file: null,
  });

  useEffect(() => {
    if (authLoading) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [
          propertiesData,
          ownersData,
          interestedData,
          buyersData,
          leasesData,
        ] = await Promise.all([
          propertiesApi.getAll(),
          ownersApi.getAll(),
          interestedApi.getAll({ limit: 100 }),
          buyersApi.getAll({ limit: 100 }),
          leasesApi.getAll({ includeFinalized: true }),
        ]);

        setProperties(propertiesData);
        setOwners(ownersData);
        setProfiles(interestedData.data);
        setBuyers(buyersData);
        setAllLeases(leasesData);
      } catch (error) {
        console.error("Failed to load current contract import data", error);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [authLoading]);

  const filteredProperties = useMemo(
    () =>
      properties.filter((property) => {
        const operations = property.operations ?? [];
        return form.contractType === "sale"
          ? operations.length === 0 || operations.includes("sale")
          : operations.length === 0 || operations.includes("rent");
      }),
    [form.contractType, properties],
  );
  const rentalPartyOptions = useMemo(
    () => buildRentalPartyOptions(profiles),
    [profiles],
  );
  const salePartyOptions = useMemo(
    () => buildSalePartyOptions(profiles, buyers),
    [buyers, profiles],
  );
  const selectedPartyOptions =
    form.contractType === "sale" ? salePartyOptions : rentalPartyOptions;
  const selectedParty = selectedPartyOptions.find(
    (option) => option.id === form.partyId,
  );
  const selectedProperty = filteredProperties.find(
    (property) => property.id === form.propertyId,
  );
  const selectedExistingLease = useMemo(() => {
    if (!form.propertyId || !form.partyId) {
      return undefined;
    }

    return allLeases
      .filter((lease) => {
        if (lease.status === "FINALIZED") {
          return false;
        }

        if (lease.propertyId !== form.propertyId) {
          return false;
        }

        if (form.contractType === "sale") {
          return (
            lease.contractType === "sale" &&
            Boolean(selectedParty?.buyerId) &&
            lease.buyerId === selectedParty?.buyerId
          );
        }

        return (
          lease.contractType === "rental" &&
          Boolean(selectedParty?.tenantId) &&
          lease.tenantId === selectedParty?.tenantId
        );
      })
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      )[0];
  }, [
    allLeases,
    form.contractType,
    form.partyId,
    form.propertyId,
    selectedParty?.buyerId,
    selectedParty?.tenantId,
  ]);

  useEffect(() => {
    if (
      !selectedProperty?.ownerId ||
      form.ownerId === selectedProperty.ownerId
    ) {
      return;
    }

    setForm((prev) => ({ ...prev, ownerId: selectedProperty.ownerId }));
  }, [form.ownerId, selectedProperty]);

  const handleQuickInterestedInputChange = (
    field: keyof QuickInterestedFormState,
    value: string,
  ) => {
    setQuickInterestedForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateInterested = async () => {
    const firstName = quickInterestedForm.firstName.trim();
    const lastName = quickInterestedForm.lastName.trim();
    const phone = quickInterestedForm.phone.trim();
    const email = quickInterestedForm.email.trim();

    if (!firstName || !lastName || !phone) {
      alert(
        "Nombre, apellido y telefono son obligatorios para crear el interesado.",
      );
      return;
    }

    try {
      setCreatingInterested(true);
      const operation = form.contractType === "sale" ? "sale" : "rent";
      const created = await interestedApi.create({
        firstName,
        lastName,
        phone,
        email: email || undefined,
        operation,
        operations: [operation],
        status: "interested",
      });

      setProfiles((prev) => [created, ...prev]);
      setForm((prev) => ({
        ...prev,
        partyId:
          prev.contractType === "sale"
            ? `${INTERESTED_BUYER_PREFIX}${created.id}`
            : `${INTERESTED_TENANT_PREFIX}${created.id}`,
      }));
      setQuickInterestedForm({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
      });
      setShowQuickInterestedForm(false);
    } catch (error) {
      console.error("Failed to create interested profile", error);
      alert("No se pudo crear el interesado.");
    } finally {
      setCreatingInterested(false);
    }
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.file || !form.propertyId || !form.ownerId || !form.partyId) {
      return;
    }

    try {
      setSaving(true);

      if (selectedExistingLease) {
        router.push(`/leases/${selectedExistingLease.id}`);
        router.refresh();
        return;
      }

      let tenantId: string | undefined;
      let buyerId: string | undefined;

      if (form.contractType === "rental") {
        if (!selectedParty) {
          throw new Error("Tenant option not found");
        }

        tenantId = selectedParty.tenantId;
        if (!tenantId) {
          const conversion = await interestedApi.convertToTenant(
            selectedParty.profileId,
            {},
          );
          tenantId = conversion.tenant.id;
        }
      } else if (selectedParty?.buyerId) {
        buyerId = selectedParty.buyerId;
      } else if (selectedParty?.profileId) {
        const conversion = await interestedApi.convertToBuyer(
          selectedParty.profileId,
          {},
        );
        buyerId = conversion.buyer.id;
        setBuyers((prev) => [
          conversion.buyer as Buyer,
          ...prev.filter((buyer) => buyer.id !== conversion.buyer.id),
        ]);
        setProfiles((prev) =>
          prev.map((profile) =>
            profile.id === selectedParty.profileId
              ? {
                  ...profile,
                  status: "buyer",
                  convertedToBuyerId: conversion.buyer.id,
                }
              : profile,
          ),
        );
      }

      const payload: ImportCurrentLeaseInput = {
        propertyId: form.propertyId,
        ownerId: form.ownerId,
        contractType: form.contractType,
        tenantId,
        buyerId,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        rentAmount: form.rentAmount ? Number(form.rentAmount) : undefined,
        depositAmount: form.depositAmount
          ? Number(form.depositAmount)
          : undefined,
        fiscalValue: form.fiscalValue ? Number(form.fiscalValue) : undefined,
        currency: form.currency,
        notes: form.notes.trim() || undefined,
        file: form.file,
      };

      const lease = await leasesApi.importCurrentContract(payload);
      router.push(`/leases/${lease.id}`);
      router.refresh();
    } catch (error) {
      console.error("Failed to import current contract", error);
      alert("No se pudo cargar el contrato actual.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/leases`}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft size={16} className="mr-1" />
          Volver a contratos
        </Link>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Carga de contratos actuales
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            Subir contrato vigente al sistema
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Permite asociar el archivo existente, dejar elegidas las partes y
            crear el contrato operativo para seguir pagos, renovaciones o
            ventas.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="import-contract-type"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Tipo de contrato
              </label>
              <select
                id="import-contract-type"
                value={form.contractType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    contractType: event.target.value as ContractType,
                    partyId: "",
                  }))
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="rental">Alquiler</option>
                <option value="sale">Venta</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="import-property"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Propiedad
              </label>
              <select
                id="import-property"
                value={form.propertyId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    propertyId: event.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Seleccionar propiedad</option>
                {filteredProperties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="import-owner"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                {form.contractType === "sale" ? "Vendedor" : "Locador"}
              </label>
              <select
                id="import-owner"
                value={form.ownerId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ownerId: event.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Seleccionar persona</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.firstName} {owner.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="import-party"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                {form.contractType === "sale"
                  ? "Comprador / interesado"
                  : "Locatario / interesado"}
              </label>
              <select
                id="import-party"
                value={form.partyId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, partyId: event.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Seleccionar persona</option>
                {selectedPartyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedExistingLease ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">
                Ya existe un contrato abierto para esta propiedad y esta parte.
              </p>
              <p className="mt-1">
                Si continuas, te llevo directo a ese contrato para evitar
                duplicados.
              </p>
              <Link
                href={`/${locale}/leases/${selectedExistingLease.id}`}
                className="mt-3 inline-flex rounded-full border border-amber-300 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
              >
                Abrir contrato existente
              </Link>
            </div>
          ) : null}

          {form.contractType === "rental" &&
          selectedParty &&
          !selectedParty.tenantId ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
              El perfil elegido todavia no esta convertido en inquilino. Lo voy
              a convertir automaticamente al cargar el contrato.
            </div>
          ) : null}

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {form.contractType === "sale"
                    ? "No encontras al comprador en la lista?"
                    : "No encontras al interesado de alquiler en la lista?"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Podes crearlo desde este mismo flujo y queda seleccionado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickInterestedForm((prev) => !prev)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                {showQuickInterestedForm
                  ? "Ocultar formulario"
                  : "Crear interesado"}
              </button>
            </div>

            {showQuickInterestedForm ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="quick-interested-first-name"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Nombre
                  </label>
                  <input
                    id="quick-interested-first-name"
                    type="text"
                    value={quickInterestedForm.firstName}
                    onChange={(event) =>
                      handleQuickInterestedInputChange(
                        "firstName",
                        event.target.value,
                      )
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="quick-interested-last-name"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Apellido
                  </label>
                  <input
                    id="quick-interested-last-name"
                    type="text"
                    value={quickInterestedForm.lastName}
                    onChange={(event) =>
                      handleQuickInterestedInputChange(
                        "lastName",
                        event.target.value,
                      )
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="quick-interested-phone"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Telefono
                  </label>
                  <input
                    id="quick-interested-phone"
                    type="text"
                    value={quickInterestedForm.phone}
                    onChange={(event) =>
                      handleQuickInterestedInputChange(
                        "phone",
                        event.target.value,
                      )
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="quick-interested-email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Email
                  </label>
                  <input
                    id="quick-interested-email"
                    type="email"
                    value={quickInterestedForm.email}
                    onChange={(event) =>
                      handleQuickInterestedInputChange(
                        "email",
                        event.target.value,
                      )
                    }
                    className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateInterested()}
                    disabled={creatingInterested}
                    className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
                  >
                    {creatingInterested ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Guardar interesado
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {form.contractType === "rental" ? (
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label
                  htmlFor="import-start-date"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Inicio
                </label>
                <input
                  id="import-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="import-end-date"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Fin
                </label>
                <input
                  id="import-end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="import-rent-amount"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Canon actual
                </label>
                <input
                  id="import-rent-amount"
                  type="number"
                  value={form.rentAmount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      rentAmount: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="import-deposit-amount"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Deposito
                </label>
                <input
                  id="import-deposit-amount"
                  type="number"
                  value={form.depositAmount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      depositAmount: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="import-fiscal-value"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Valor del acuerdo
                </label>
                <input
                  id="import-fiscal-value"
                  type="number"
                  value={form.fiscalValue}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      fiscalValue: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <p className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Moneda
                </p>
                <CurrencySelect
                  value={form.currency}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, currency: value }))
                  }
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Archivo del contrato
              </p>
              <label
                htmlFor="import-contract-file"
                className="mt-1 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-950/40"
              >
                <Upload className="mb-2 h-5 w-5 text-slate-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  {form.file?.name ?? "Elegir PDF, DOC, DOCX, MD o TXT"}
                </span>
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Solo se aceptan formatos interpretables sin OCR. Si no se
                  puede reconstruir el texto, el archivo se rechaza.
                </span>
                <input
                  id="import-contract-file"
                  type="file"
                  accept=".pdf,.doc,.docx,.md,.txt"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    if (!nextFile) {
                      setForm((prev) => ({ ...prev, file: null }));
                      return;
                    }

                    const normalizedName = nextFile.name.toLowerCase();
                    const isSupported = [
                      ".pdf",
                      ".doc",
                      ".docx",
                      ".md",
                      ".txt",
                    ].some((extension) => normalizedName.endsWith(extension));

                    if (!isSupported) {
                      alert(
                        "Solo se aceptan contratos en PDF, DOC, DOCX, MD o TXT.",
                      );
                      event.currentTarget.value = "";
                      return;
                    }

                    setForm((prev) => ({
                      ...prev,
                      file: nextFile,
                    }));
                  }}
                />
              </label>
            </div>

            <div>
              <label
                htmlFor="import-notes"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Observaciones
              </label>
              <textarea
                id="import-notes"
                rows={6}
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href={`/${locale}/leases`}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-950"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Crear contrato actual
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
