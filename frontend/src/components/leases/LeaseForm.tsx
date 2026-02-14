"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateLeaseInput, Lease, LeaseTemplate } from "@/types/lease";
import { Owner } from "@/types/owner";
import { leasesApi } from "@/lib/api/leases";
import { propertiesApi } from "@/lib/api/properties";
import { ownersApi } from "@/lib/api/owners";
import { interestedApi } from "@/lib/api/interested";
import { Property } from "@/types/property";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createLeaseSchema, LeaseFormData } from "@/lib/validation-schemas";
import { CurrencySelect } from "@/components/common/CurrencySelect";
import { useSearchParams } from "next/navigation";

interface LeaseFormProps {
  readonly initialData?: Lease;
  readonly isEditing?: boolean;
}

interface LeaseTenantOption {
  id: string;
  label: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface LeaseBuyerOption {
  id: string;
  label: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

type TemplateContext = Record<string, unknown>;
const TEMPLATE_PLACEHOLDER_REGEX =
  /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}|\{([a-zA-Z0-9_.]+)\}/g;

const toDateString = (value: string | Date | undefined): string | undefined => {
  if (!value) return undefined;
  return new Date(value).toISOString().slice(0, 10);
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const resolveTemplateValue = (
  context: TemplateContext,
  path: string,
): unknown => {
  const segments = path.split(".");
  let current: unknown = context;

  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

const renderTemplate = (
  templateBody: string,
  context: TemplateContext,
): string => {
  const paragraphs = templateBody.split(/\n\s*\n/);
  const renderedParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    let hasMissingValue = false;
    const rendered = paragraph.replace(
      // NOSONAR
      TEMPLATE_PLACEHOLDER_REGEX,
      (_full, keyWithDoubleBraces?: string, keyWithSingleBraces?: string) => {
        const key = keyWithDoubleBraces ?? keyWithSingleBraces;
        if (!key) return "";

        const value = resolveTemplateValue(context, key);
        if (value === null || value === undefined || value === "") {
          hasMissingValue = true;
          return "";
        }
        return String(value); // NOSONAR
      },
    );

    if (!hasMissingValue && rendered.trim().length > 0) {
      renderedParagraphs.push(rendered.trim());
    }
  }

  return renderedParagraphs.join("\n\n");
};

const getLeaseNumber = (lease?: Lease): string | undefined => {
  if (!lease) return undefined;
  const withLeaseNumber = lease as Lease & { leaseNumber?: string };
  if (typeof withLeaseNumber.leaseNumber === "string") {
    return withLeaseNumber.leaseNumber;
  }
  return undefined;
};

export function LeaseForm({ initialData, isEditing = false }: LeaseFormProps) {
  // NOSONAR
  const router = useLocalizedRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("leases");
  const tCommon = useTranslations("common");
  const tValidation = useTranslations("validation");
  const tCurrencies = useTranslations("currencies");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenantOptions, setTenantOptions] = useState<LeaseTenantOption[]>([]);
  const [buyerOptions, setBuyerOptions] = useState<LeaseBuyerOption[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [templates, setTemplates] = useState<LeaseTemplate[]>([]);

  // Crear schema con mensajes traducidos
  const leaseSchema = useMemo(
    () => createLeaseSchema(tValidation),
    [tValidation],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LeaseFormData>({
    resolver: zodResolver(leaseSchema) as Resolver<LeaseFormData>,
    defaultValues: initialData || {
      contractType: "rental",
      status: "DRAFT",
      rentAmount: 0,
      depositAmount: 0,
      currency: "ARS",
      paymentFrequency: "monthly",
      billingFrequency: "first_of_month",
      lateFeeType: "none",
      adjustmentType: "fixed",
      autoGenerateInvoices: true,
    },
  });

  const formValues = watch();
  const lateFeeType = formValues.lateFeeType;
  const adjustmentType = formValues.adjustmentType;
  const contractType = formValues.contractType ?? "rental";
  const selectedPropertyId = formValues.propertyId;
  const selectedOwnerId = formValues.ownerId;
  const selectedTemplateId = formValues.templateId;
  const preselectedPropertyId = searchParams.get("propertyId");
  const preselectedPropertyName = searchParams.get("propertyName");
  const preselectedOwnerName = searchParams.get("ownerName");
  const preselectedPropertyOperationsRaw =
    searchParams.get("propertyOperations");
  const preselectedTenantId = searchParams.get("tenantId");
  const preselectedBuyerProfileId = searchParams.get("buyerProfileId");
  const hasPreselectedProperty = !isEditing && !!preselectedPropertyId;
  const hasPreselectedTenant = !isEditing && !!preselectedTenantId;
  const hasPreselectedBuyer = !isEditing && !!preselectedBuyerProfileId;
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === selectedPropertyId),
    [properties, selectedPropertyId],
  );
  const preselectedPropertyOperations = useMemo(
    () =>
      (preselectedPropertyOperationsRaw ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item): item is "rent" | "sale" => {
          return item === "rent" || item === "sale";
        }),
    [preselectedPropertyOperationsRaw],
  );
  const selectedPropertyOperations =
    selectedProperty?.operations?.length &&
    selectedProperty.operations.length > 0
      ? selectedProperty.operations
      : preselectedPropertyOperations;
  const selectedPropertySupportsRent =
    selectedPropertyOperations.includes("rent");
  const selectedPropertySupportsSale =
    selectedPropertyOperations.includes("sale");
  const selectedOwner = useMemo(
    () => owners.find((owner) => owner.id === selectedOwnerId),
    [owners, selectedOwnerId],
  );
  const selectedTenantOption = useMemo(
    () => tenantOptions.find((item) => item.id === formValues.tenantId),
    [formValues.tenantId, tenantOptions],
  );
  const selectedBuyerOption = useMemo(
    () => buyerOptions.find((item) => item.id === formValues.buyerProfileId),
    [buyerOptions, formValues.buyerProfileId],
  );
  const shouldLockContractTypeByInterested =
    !isEditing && (hasPreselectedTenant || hasPreselectedBuyer);
  const shouldShowContractTypeSelect =
    !shouldLockContractTypeByInterested &&
    selectedPropertySupportsRent &&
    selectedPropertySupportsSale;
  const hasResolvableContractTypeFromProperty =
    selectedPropertySupportsRent || selectedPropertySupportsSale;
  const selectedPropertyDisplayName =
    selectedProperty?.name ?? preselectedPropertyName ?? t("unknownProperty");
  const selectedOwnerDisplayName =
    selectedOwner &&
    `${selectedOwner.firstName} ${selectedOwner.lastName}`.trim()
      ? `${selectedOwner.firstName} ${selectedOwner.lastName}`.trim()
      : (preselectedOwnerName ?? "-");
  const contractTypeHelperText = shouldLockContractTypeByInterested
    ? t("contractTypeFixedByInterested") // NOSONAR
    : hasResolvableContractTypeFromProperty
      ? t("contractTypeFixedByProperty")
      : t("selectProperty");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [props, interestedResponse, owns, leaseTemplates] =
          await Promise.all([
            propertiesApi.getAll(),
            interestedApi.getAll({ limit: 100 }),
            ownersApi.getAll(),
            leasesApi.getTemplates(),
          ]);
        let resolvedProperties = props;
        let resolvedOwners = owns;

        if (
          preselectedPropertyId &&
          !resolvedProperties.some(
            (property) => property.id === preselectedPropertyId,
          )
        ) {
          const preselectedProperty = await propertiesApi.getById(
            preselectedPropertyId,
          );
          if (preselectedProperty) {
            resolvedProperties = [preselectedProperty, ...resolvedProperties];
          }
        }

        const ownerIdFromPreselectedProperty = resolvedProperties.find(
          (property) => property.id === preselectedPropertyId,
        )?.ownerId;
        if (
          ownerIdFromPreselectedProperty &&
          !resolvedOwners.some(
            (owner) => owner.id === ownerIdFromPreselectedProperty,
          )
        ) {
          const ownerFromPreselectedProperty = await ownersApi.getById(
            ownerIdFromPreselectedProperty,
          );
          if (ownerFromPreselectedProperty) {
            resolvedOwners = [ownerFromPreselectedProperty, ...resolvedOwners];
          }
        }

        const options = interestedResponse.data
          .filter((profile) => {
            const profileOperations =
              profile.operations ??
              (profile.operation ? [profile.operation] : []);
            return (
              !!profile.convertedToTenantId &&
              profileOperations.includes("rent")
            );
          })
          .map((profile) => ({
            id: profile.convertedToTenantId as string,
            label:
              `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ||
              profile.phone,
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
          }))
          .filter(
            // NOSONAR
            (option, index, all) =>
              all.findIndex((item) => item.id === option.id) === index,
          );

        const saleProfiles = interestedResponse.data
          .filter((profile) => {
            const profileOperations =
              profile.operations ??
              (profile.operation ? [profile.operation] : []);
            return profileOperations.includes("sale");
          })
          .map((profile) => ({
            id: profile.id,
            label:
              `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ||
              profile.phone,
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
          }));

        setProperties(resolvedProperties);
        setTenantOptions(options);
        setBuyerOptions(saleProfiles);
        setOwners(resolvedOwners);
        setTemplates(leaseTemplates);
      } catch (error) {
        console.error("Failed to load form data", error);
      }
    };
    loadData();
  }, [preselectedPropertyId]);

  useEffect(() => {
    if (!selectedProperty?.ownerId) return;
    if (owners.some((owner) => owner.id === selectedProperty.ownerId)) return;

    let active = true;
    const loadMissingOwner = async () => {
      try {
        const missingOwner = await ownersApi.getById(selectedProperty.ownerId);
        if (!missingOwner || !active) return;
        setOwners((currentOwners) => {
          // NOSONAR
          if (currentOwners.some((owner) => owner.id === missingOwner.id)) {
            return currentOwners;
          }
          return [missingOwner, ...currentOwners];
        });
      } catch (error) {
        console.error("Failed to load owner for selected property", error);
      }
    };

    void loadMissingOwner();
    return () => {
      active = false;
    };
  }, [owners, selectedProperty?.ownerId]);

  useEffect(() => {
    // NOSONAR
    if (isEditing) {
      return;
    }
    if (preselectedPropertyId) {
      setValue("propertyId", preselectedPropertyId);
    }
    if (preselectedTenantId) {
      setValue("tenantId", preselectedTenantId);
      setValue("contractType", "rental");
    }
    if (preselectedBuyerProfileId) {
      setValue("buyerProfileId", preselectedBuyerProfileId);
      setValue("contractType", "sale");
    }
  }, [
    isEditing,
    preselectedPropertyId,
    preselectedTenantId,
    preselectedBuyerProfileId,
    setValue,
  ]);

  useEffect(() => {
    if (!selectedProperty?.ownerId) return;
    if (selectedOwnerId === selectedProperty.ownerId) return;
    setValue("ownerId", selectedProperty.ownerId, { shouldValidate: true });
  }, [selectedOwnerId, selectedProperty, setValue]);

  useEffect(() => {
    if (!selectedProperty) return;

    if (shouldLockContractTypeByInterested) {
      if (hasPreselectedTenant && contractType !== "rental") {
        setValue("contractType", "rental", { shouldValidate: true });
      }
      if (hasPreselectedBuyer && contractType !== "sale") {
        setValue("contractType", "sale", { shouldValidate: true });
      }
      return;
    }

    if (selectedPropertySupportsRent && !selectedPropertySupportsSale) {
      if (contractType !== "rental") {
        setValue("contractType", "rental", { shouldValidate: true });
      }
      setValue("buyerProfileId", undefined, { shouldValidate: true });
      return;
    }

    if (!selectedPropertySupportsRent && selectedPropertySupportsSale) {
      if (contractType !== "sale") {
        setValue("contractType", "sale", { shouldValidate: true });
      }
      setValue("tenantId", undefined, { shouldValidate: true });
      return;
    }

    if (contractType !== "rental" && contractType !== "sale") {
      setValue("contractType", "rental", { shouldValidate: true });
    }
  }, [
    contractType,
    hasPreselectedBuyer,
    hasPreselectedTenant,
    selectedProperty,
    selectedPropertySupportsRent,
    selectedPropertySupportsSale,
    setValue,
    shouldLockContractTypeByInterested,
  ]);

  const filteredProperties = useMemo(() => {
    const filtered = properties.filter((property) => {
      if (!shouldLockContractTypeByInterested) {
        return true;
      }
      const requiredOperation = hasPreselectedBuyer ? "sale" : "rent";
      const ops = property.operations ?? [];
      if (ops.length === 0) return true;
      return ops.includes(requiredOperation);
    });

    if (
      selectedProperty &&
      !filtered.some((property) => property.id === selectedProperty.id)
    ) {
      return [selectedProperty, ...filtered];
    }

    return filtered;
  }, [
    hasPreselectedBuyer,
    properties,
    selectedProperty,
    shouldLockContractTypeByInterested,
  ]);

  const templatesForType = useMemo(
    () => templates.filter((item) => item.contractType === contractType),
    [contractType, templates],
  );
  const singleTemplateForType =
    templatesForType.length === 1 ? templatesForType[0] : null;

  useEffect(() => {
    if (singleTemplateForType) {
      if (selectedTemplateId !== singleTemplateForType.id) {
        setValue("templateId", singleTemplateForType.id, {
          shouldValidate: true,
        });
      }
      return;
    }

    if (isEditing) return;
    const currentTemplateId = selectedTemplateId ?? "";
    const hasCurrentTemplate = templatesForType.some(
      (item) => item.id === currentTemplateId,
    );

    if (!hasCurrentTemplate) {
      const nextTemplateId = templatesForType[0]?.id ?? "";
      if (currentTemplateId !== nextTemplateId) {
        setValue("templateId", nextTemplateId, { shouldValidate: true });
      }
    }
  }, [
    isEditing,
    selectedTemplateId,
    setValue,
    singleTemplateForType,
    templatesForType,
  ]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId),
    [selectedTemplateId, templates],
  );

  const templateContext = useMemo<TemplateContext>(() => {
    const ownerFirstName = selectedOwner?.firstName ?? "";
    const ownerLastName = selectedOwner?.lastName ?? "";
    const tenantFirstName = selectedTenantOption?.firstName ?? "";
    const tenantLastName = selectedTenantOption?.lastName ?? "";
    const buyerFirstName = selectedBuyerOption?.firstName ?? "";
    const buyerLastName = selectedBuyerOption?.lastName ?? "";

    return {
      today: toDateString(new Date()) ?? "",
      lease: {
        id: initialData?.id ?? "",
        leaseNumber: getLeaseNumber(initialData) ?? "",
        contractType,
        status: formValues.status,
        startDate: toDateString(formValues.startDate),
        endDate: toDateString(formValues.endDate),
        monthlyRent: toNumberOrUndefined(formValues.rentAmount),
        fiscalValue: toNumberOrUndefined(formValues.fiscalValue),
        currency: formValues.currency ?? "ARS",
        paymentFrequency: formValues.paymentFrequency,
        paymentDueDay: toNumberOrUndefined(formValues.paymentDueDay),
        billingFrequency: formValues.billingFrequency,
        billingDay: toNumberOrUndefined(formValues.billingDay),
        lateFeeType: formValues.lateFeeType,
        lateFeeValue: toNumberOrUndefined(formValues.lateFeeValue),
        lateFeeGraceDays: toNumberOrUndefined(formValues.lateFeeGraceDays),
        lateFeeMax: toNumberOrUndefined(formValues.lateFeeMax),
        adjustmentType: formValues.adjustmentType,
        adjustmentValue: toNumberOrUndefined(formValues.adjustmentValue),
        adjustmentFrequencyMonths: toNumberOrUndefined(
          formValues.adjustmentFrequencyMonths,
        ),
        inflationIndexType: formValues.inflationIndexType,
        nextAdjustmentDate: toDateString(formValues.nextAdjustmentDate),
        autoGenerateInvoices: formValues.autoGenerateInvoices,
        securityDeposit: toNumberOrUndefined(formValues.depositAmount),
        termsAndConditions: formValues.terms ?? "",
      },
      property: {
        name: selectedProperty?.name,
        addressStreet: selectedProperty?.address.street,
        addressNumber: selectedProperty?.address.number,
        addressCity: selectedProperty?.address.city,
        addressState: selectedProperty?.address.state,
        addressPostalCode: selectedProperty?.address.zipCode,
        addressCountry: selectedProperty?.address.country,
      },
      owner: {
        firstName: ownerFirstName,
        lastName: ownerLastName,
        fullName: `${ownerFirstName} ${ownerLastName}`.trim(),
        email: selectedOwner?.email ?? "",
        phone: selectedOwner?.phone ?? "",
      },
      tenant: {
        firstName: tenantFirstName,
        lastName: tenantLastName,
        fullName: `${tenantFirstName} ${tenantLastName}`.trim(),
        email: selectedTenantOption?.email ?? "",
        phone: selectedTenantOption?.phone ?? "",
      },
      buyer: {
        firstName: buyerFirstName,
        lastName: buyerLastName,
        fullName: `${buyerFirstName} ${buyerLastName}`.trim(),
        email: selectedBuyerOption?.email ?? "",
        phone: selectedBuyerOption?.phone ?? "",
      },
    };
  }, [
    contractType,
    formValues.adjustmentFrequencyMonths,
    formValues.adjustmentType,
    formValues.adjustmentValue,
    formValues.autoGenerateInvoices,
    formValues.billingDay,
    formValues.billingFrequency,
    formValues.currency,
    formValues.depositAmount,
    formValues.endDate,
    formValues.fiscalValue,
    formValues.inflationIndexType,
    formValues.lateFeeGraceDays,
    formValues.lateFeeMax,
    formValues.lateFeeType,
    formValues.lateFeeValue,
    formValues.nextAdjustmentDate,
    formValues.paymentDueDay,
    formValues.paymentFrequency,
    formValues.rentAmount,
    formValues.startDate,
    formValues.status,
    formValues.terms,
    initialData,
    selectedBuyerOption,
    selectedOwner,
    selectedProperty,
    selectedTenantOption,
  ]);

  const renderedTemplateTerms = useMemo(() => {
    if (!selectedTemplate) return "";
    return renderTemplate(
      selectedTemplate.templateBody,
      templateContext,
    ).trim();
  }, [selectedTemplate, templateContext]);

  useEffect(() => {
    if (!selectedTemplate) return;
    if ((formValues.terms ?? "").trim() === renderedTemplateTerms) return;
    setValue("terms", renderedTemplateTerms, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [formValues.terms, renderedTemplateTerms, selectedTemplate, setValue]);

  const onSubmit = async (data: LeaseFormData) => {
    // NOSONAR
    if (hasPreselectedProperty && !selectedProperty) {
      alert(t("unknownProperty"));
      return;
    }
    // NOSONAR
    setIsSubmitting(true);
    try {
      const resolvedOwnerId = selectedProperty?.ownerId ?? data.ownerId; // NOSONAR
      const resolvedContractType = shouldLockContractTypeByInterested
        ? hasPreselectedBuyer // NOSONAR
          ? "sale"
          : "rental"
        : selectedPropertySupportsRent && !selectedPropertySupportsSale
          ? "rental"
          : !selectedPropertySupportsRent && selectedPropertySupportsSale
            ? "sale"
            : data.contractType;

      const payload: LeaseFormData = {
        ...data,
        ownerId: resolvedOwnerId,
        contractType: resolvedContractType,
        terms: selectedTemplate ? renderedTemplateTerms : data.terms,
      };

      if (isEditing && initialData) {
        const updated = await leasesApi.update(initialData.id, payload);
        router.push(`/leases/${updated.id}`);
      } else {
        const newLease = await leasesApi.create(payload as CreateLeaseInput);
        router.push(`/leases/${newLease.id}`);
      }
      router.refresh();
    } catch (error) {
      console.error("Error saving lease:", error);
      alert(tCommon("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white";
  const readOnlyInputClass = `${inputClass} bg-gray-100 dark:bg-gray-900/40`;
  const labelClass =
    "block text-sm font-medium text-gray-700 dark:text-gray-300";
  const sectionClass = "space-y-4";
  const sectionTitleClass =
    "text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xs border border-gray-100 dark:border-gray-700"
    >
      {/* Basic Lease Details */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t("leaseDetails")}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hasPreselectedProperty ? (
            <div>
              <input type="hidden" {...register("propertyId")} />
              <label className={labelClass}>{t("fields.property")}</label>
              <p className={readOnlyInputClass}>
                {selectedPropertyDisplayName}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("prefilledFieldHint")}
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="propertyId" className={labelClass}>
                {t("fields.property")}
              </label>
              <select
                id="propertyId"
                {...register("propertyId")}
                className={inputClass}
              >
                <option value="">{t("selectProperty")}</option>
                {filteredProperties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {errors.propertyId && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.propertyId.message}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="contractType" className={labelClass}>
              {t("fields.contractType")}
            </label>
            {shouldShowContractTypeSelect ? (
              <select
                id="contractType"
                {...register("contractType")}
                className={inputClass}
              >
                <option value="rental">{t("contractTypes.rental")}</option>
                <option value="sale">{t("contractTypes.sale")}</option>
              </select>
            ) : (
              <>
                <input type="hidden" {...register("contractType")} />
                <p className={inputClass}>
                  {hasResolvableContractTypeFromProperty
                    ? t(`contractTypes.${contractType}`)
                    : "-"}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {contractTypeHelperText}
                </p>
              </>
            )}
            {errors.contractType && (
              <p className="mt-1 text-sm text-red-600">
                {errors.contractType.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="templateId" className={labelClass}>
              {t("fields.template")}
            </label>
            {singleTemplateForType ? (
              <>
                <input type="hidden" {...register("templateId")} />
                <p className={inputClass}>{singleTemplateForType.name}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("templateLockedHint")}
                </p>
              </>
            ) : (
              <select
                id="templateId"
                {...register("templateId")}
                className={inputClass}
              >
                <option value="">{t("templates.select")}</option>
                {templatesForType.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("templateAutofillHint")}
            </p>
            {selectedTemplate ? (
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                {t("templateInUse")}: {selectedTemplate.name}
              </p>
            ) : null}
          </div>

          <div>
            <input type="hidden" {...register("ownerId")} />
            <label className={labelClass}>{t("fields.owner")}</label>
            <p className={readOnlyInputClass}>{selectedOwnerDisplayName}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("ownerFromPropertyHint")}
            </p>
            {errors.ownerId && (
              <p className="mt-1 text-sm text-red-600">
                {errors.ownerId.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="status" className={labelClass}>
              {t("fields.status")}
            </label>
            <select id="status" {...register("status")} className={inputClass}>
              <option value="DRAFT">{t("status.DRAFT")}</option>
              <option value="ACTIVE">{t("status.ACTIVE")}</option>
              <option value="FINALIZED">{t("status.FINALIZED")}</option>
            </select>
          </div>
        </div>

        {contractType === "rental" &&
          (hasPreselectedTenant ? (
            <div>
              <input type="hidden" {...register("tenantId")} />
              <label className={labelClass}>{t("fields.tenant")}</label>
              <p className={readOnlyInputClass}>
                {selectedTenantOption?.label ?? preselectedTenantId}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("prefilledFieldHint")}
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="tenantId" className={labelClass}>
                {t("fields.tenant")}
              </label>
              <select
                id="tenantId"
                {...register("tenantId")}
                className={inputClass}
              >
                <option value="">{t("selectTenant")}</option>
                {tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.label}
                  </option>
                ))}
              </select>
              {errors.tenantId && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.tenantId.message}
                </p>
              )}
            </div>
          ))}

        {contractType === "rental" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className={labelClass}>
                {t("fields.startDate")}
              </label>
              <input
                id="startDate"
                type="date"
                {...register("startDate")}
                className={inputClass}
              />
              {errors.startDate && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.startDate.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="endDate" className={labelClass}>
                {t("fields.endDate")}
              </label>
              <input
                id="endDate"
                type="date"
                {...register("endDate")}
                className={inputClass}
              />
              {errors.endDate && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.endDate.message}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasPreselectedBuyer ? (
              <div>
                <input type="hidden" {...register("buyerProfileId")} />
                <label className={labelClass}>{t("fields.buyer")}</label>
                <p className={readOnlyInputClass}>
                  {selectedBuyerOption?.label ?? preselectedBuyerProfileId}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("prefilledFieldHint")}
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="buyerProfileId" className={labelClass}>
                  {t("fields.buyer")}
                </label>
                <select
                  id="buyerProfileId"
                  {...register("buyerProfileId")}
                  className={inputClass}
                >
                  <option value="">{t("selectBuyer")}</option>
                  {buyerOptions.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>
                      {buyer.label}
                    </option>
                  ))}
                </select>
                {errors.buyerProfileId && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.buyerProfileId.message}
                  </p>
                )}
              </div>
            )}
            <div>
              <label htmlFor="fiscalValue" className={labelClass}>
                {t("fields.fiscalValue")}
              </label>
              <input
                id="fiscalValue"
                type="number"
                {...register("fiscalValue")}
                className={inputClass}
              />
              {errors.fiscalValue && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.fiscalValue.message}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {contractType === "rental" && (
            <div>
              <label htmlFor="rentAmount" className={labelClass}>
                {t("fields.rentAmount")}
              </label>
              <input
                id="rentAmount"
                type="number"
                {...register("rentAmount")}
                className={inputClass}
              />
              {errors.rentAmount && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.rentAmount.message}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="depositAmount" className={labelClass}>
              {t("fields.depositAmount")}
            </label>
            <input
              id="depositAmount"
              type="number"
              {...register("depositAmount")}
              className={inputClass}
            />
            {errors.depositAmount && (
              <p className="mt-1 text-sm text-red-600">
                {errors.depositAmount.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="currency" className={labelClass}>
              {tCurrencies("title")}
            </label>
            <CurrencySelect
              value={formValues.currency || "ARS"}
              onChange={(value) => setValue("currency", value)}
            />
            {errors.currency && (
              <p className="mt-1 text-sm text-red-600">
                {errors.currency.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Billing Configuration */}
      {contractType === "rental" && (
        <div className={sectionClass}>
          <h3 className={sectionTitleClass}>{t("billing.title")}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("billing.description")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="paymentFrequency" className={labelClass}>
                {t("fields.paymentFrequency")}
              </label>
              <select
                id="paymentFrequency"
                {...register("paymentFrequency")}
                className={inputClass}
              >
                <option value="monthly">
                  {t("paymentFrequencies.monthly")}
                </option>
                <option value="bimonthly">
                  {t("paymentFrequencies.bimonthly")}
                </option>
                <option value="quarterly">
                  {t("paymentFrequencies.quarterly")}
                </option>
                <option value="semiannual">
                  {t("paymentFrequencies.semiannual")}
                </option>
                <option value="annual">{t("paymentFrequencies.annual")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="billingFrequency" className={labelClass}>
                {t("fields.billingFrequency")}
              </label>
              <select
                id="billingFrequency"
                {...register("billingFrequency")}
                className={inputClass}
              >
                <option value="first_of_month">
                  {t("billingFrequencies.first_of_month")}
                </option>
                <option value="last_of_month">
                  {t("billingFrequencies.last_of_month")}
                </option>
                <option value="contract_date">
                  {t("billingFrequencies.contract_date")}
                </option>
                <option value="custom">{t("billingFrequencies.custom")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="billingDay" className={labelClass}>
                {t("fields.billingDay")}
              </label>
              <input
                id="billingDay"
                type="number"
                min="1"
                max="28"
                {...register("billingDay")}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="paymentDueDay" className={labelClass}>
                {t("fields.paymentDueDay")}
              </label>
              <input
                id="paymentDueDay"
                type="number"
                min="1"
                max="28"
                {...register("paymentDueDay")}
                className={inputClass}
              />
            </div>

            <div className="flex items-center pt-6">
              <input
                id="autoGenerateInvoices"
                type="checkbox"
                {...register("autoGenerateInvoices")}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded-sm"
              />
              <label
                htmlFor="autoGenerateInvoices"
                className="ml-2 text-sm text-gray-700 dark:text-gray-300"
              >
                {t("fields.autoGenerateInvoices")}
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Late Fee Configuration */}
      {contractType === "rental" && (
        <div className={sectionClass}>
          <h3 className={sectionTitleClass}>{t("lateFees.title")}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("lateFees.description")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="lateFeeType" className={labelClass}>
                {t("fields.lateFeeType")}
              </label>
              <select
                id="lateFeeType"
                {...register("lateFeeType")}
                className={inputClass}
              >
                <option value="none">{t("lateFeeTypes.none")}</option>
                <option value="fixed">{t("lateFeeTypes.fixed")}</option>
                <option value="percentage">
                  {t("lateFeeTypes.percentage")}
                </option>
                <option value="daily_fixed">
                  {t("lateFeeTypes.daily_fixed")}
                </option>
                <option value="daily_percentage">
                  {t("lateFeeTypes.daily_percentage")}
                </option>
              </select>
            </div>

            {lateFeeType && lateFeeType !== "none" && (
              <>
                <div>
                  <label htmlFor="lateFeeValue" className={labelClass}>
                    {t("fields.lateFeeValue")}
                  </label>
                  <input
                    id="lateFeeValue"
                    type="number"
                    step="0.01"
                    {...register("lateFeeValue")}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="lateFeeGraceDays" className={labelClass}>
                    {t("fields.lateFeeGraceDays")}
                  </label>
                  <input
                    id="lateFeeGraceDays"
                    type="number"
                    min="0"
                    {...register("lateFeeGraceDays")}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="lateFeeMax" className={labelClass}>
                    {t("fields.lateFeeMax")}
                  </label>
                  <input
                    id="lateFeeMax"
                    type="number"
                    step="0.01"
                    {...register("lateFeeMax")}
                    className={inputClass}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Adjustment Configuration */}
      {contractType === "rental" && (
        <div className={sectionClass}>
          <h3 className={sectionTitleClass}>{t("adjustments.title")}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {t("adjustments.description")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="adjustmentType" className={labelClass}>
                {t("fields.adjustmentType")}
              </label>
              <select
                id="adjustmentType"
                {...register("adjustmentType")}
                className={inputClass}
              >
                <option value="fixed">{t("adjustmentTypes.fixed")}</option>
                <option value="percentage">
                  {t("adjustmentTypes.percentage")}
                </option>
                <option value="inflation_index">
                  {t("adjustmentTypes.inflation_index")}
                </option>
              </select>
            </div>

            {adjustmentType && adjustmentType !== "fixed" && (
              <>
                {adjustmentType === "percentage" && (
                  <div>
                    <label htmlFor="adjustmentValue" className={labelClass}>
                      {t("fields.adjustmentValue")} (%)
                    </label>
                    <input
                      id="adjustmentValue"
                      type="number"
                      step="0.01"
                      {...register("adjustmentValue")}
                      className={inputClass}
                    />
                  </div>
                )}

                {adjustmentType === "inflation_index" && (
                  <div>
                    <label htmlFor="inflationIndexType" className={labelClass}>
                      {t("fields.inflationIndexType")}
                    </label>
                    <select
                      id="inflationIndexType"
                      {...register("inflationIndexType")}
                      className={inputClass}
                    >
                      <option value="icl">
                        {t("inflationIndexTypes.icl")}
                      </option>
                      <option value="ipc">
                        {t("inflationIndexTypes.ipc")}
                      </option>
                      <option value="igp_m" disabled>
                        {t("inflationIndexTypes.igp_m_disabled")}
                      </option>
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="adjustmentFrequencyMonths"
                    className={labelClass}
                  >
                    {t("fields.adjustmentFrequencyMonths")}
                  </label>
                  <input
                    id="adjustmentFrequencyMonths"
                    type="number"
                    min="1"
                    {...register("adjustmentFrequencyMonths")}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="nextAdjustmentDate" className={labelClass}>
                    {t("fields.nextAdjustmentDate")}
                  </label>
                  <input
                    id="nextAdjustmentDate"
                    type="date"
                    {...register("nextAdjustmentDate")}
                    className={inputClass}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Terms and Conditions */}
      <div className={sectionClass}>
        <div>
          <label htmlFor="terms" className={labelClass}>
            {t("termsAndConditions")}
          </label>
          <textarea
            id="terms"
            {...register("terms")}
            rows={selectedTemplate ? 12 : 6}
            readOnly={Boolean(selectedTemplate)}
            className={selectedTemplate ? readOnlyInputClass : inputClass}
            placeholder={t("leaseTermsPlaceholder")}
          />
          {selectedTemplate ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("templateAutofillHint")}
            </p>
          ) : null}
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end pt-4 border-t dark:border-gray-700">
        <button
          type="button"
          onClick={() => router.back()}
          className="mr-3 px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-xs text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {tCommon("cancel")}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
              {tCommon("saving")}
            </>
          ) : (
            t("saveLease")
          )}
        </button>
      </div>
    </form>
  );
}
