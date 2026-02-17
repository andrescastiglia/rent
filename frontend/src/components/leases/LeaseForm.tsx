"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  useForm,
  Resolver,
  UseFormRegister,
  UseFormSetValue,
  FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateLeaseInput, Lease, LeaseTemplate } from "@/types/lease";
import { Owner } from "@/types/owner";
import { leasesApi } from "@/lib/api/leases";
import { propertiesApi } from "@/lib/api/properties";
import { ownersApi } from "@/lib/api/owners";
import { interestedApi } from "@/lib/api/interested";
import { InterestedProfile } from "@/types/interested";
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
    const rendered = paragraph.replaceAll(
      TEMPLATE_PLACEHOLDER_REGEX,
      (_full, keyWithDoubleBraces?: string, keyWithSingleBraces?: string) => {
        const key = keyWithDoubleBraces ?? keyWithSingleBraces;
        if (!key) return "";

        const value = resolveTemplateValue(context, key);
        if (value === null || value === undefined || value === "") {
          hasMissingValue = true;
          return "";
        }
        // Only allow primitives (string, number, boolean); objects/arrays output empty string
        if (
          typeof value === "object" ||
          typeof value === "function" ||
          typeof value === "symbol"
        ) {
          hasMissingValue = true;
          return "";
        }
        return String(value);
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

function getProfileOperations(profile: InterestedProfile): string[] {
  return profile.operations ?? (profile.operation ? [profile.operation] : []);
}

function formatProfileLabel(profile: InterestedProfile): string {
  return (
    `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ||
    profile.phone
  );
}

function buildTenantOptions(
  profiles: InterestedProfile[],
): LeaseTenantOption[] {
  const tenantProfiles = profiles.filter((profile) => {
    const ops = getProfileOperations(profile);
    return !!profile.convertedToTenantId && ops.includes("rent");
  });

  const mapped = tenantProfiles.map((profile) => ({
    id: profile.convertedToTenantId as string,
    label: formatProfileLabel(profile),
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
  }));

  return mapped.filter(
    (option, index, all) =>
      all.findIndex((item) => item.id === option.id) === index,
  );
}

function buildBuyerOptions(profiles: InterestedProfile[]): LeaseBuyerOption[] {
  return profiles
    .filter((profile) => getProfileOperations(profile).includes("sale"))
    .map((profile) => ({
      id: profile.id,
      label: formatProfileLabel(profile),
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
    }));
}

async function ensurePropertyLoaded(
  propertyId: string | null,
  existing: Property[],
): Promise<Property[]> {
  if (!propertyId) return existing;
  if (existing.some((p) => p.id === propertyId)) return existing;

  const property = await propertiesApi.getById(propertyId);
  return property ? [property, ...existing] : existing;
}

async function ensureOwnerLoaded(
  ownerId: string | undefined,
  existing: Owner[],
): Promise<Owner[]> {
  if (!ownerId) return existing;
  if (existing.some((o) => o.id === ownerId)) return existing;

  const owner = await ownersApi.getById(ownerId);
  return owner ? [owner, ...existing] : existing;
}

function setContractTypeIfNeeded(
  contractType: string,
  target: "rental" | "sale",
  setValue: UseFormSetValue<LeaseFormData>,
): void {
  if (contractType !== target) {
    setValue("contractType", target, { shouldValidate: true });
  }
}

function syncContractType(
  selectedProperty: Property | undefined,
  options: {
    shouldLock: boolean;
    hasPreselectedTenant: boolean;
    hasPreselectedBuyer: boolean;
    contractType: string;
    supportsRent: boolean;
    supportsSale: boolean;
  },
  setValue: UseFormSetValue<LeaseFormData>,
) {
  if (!selectedProperty) return;

  const {
    shouldLock,
    hasPreselectedTenant,
    hasPreselectedBuyer,
    contractType,
    supportsRent,
    supportsSale,
  } = options;

  if (shouldLock) {
    if (hasPreselectedTenant) {
      setContractTypeIfNeeded(contractType, "rental", setValue);
    }
    if (hasPreselectedBuyer) {
      setContractTypeIfNeeded(contractType, "sale", setValue);
    }
    return;
  }

  if (supportsRent && !supportsSale) {
    setContractTypeIfNeeded(contractType, "rental", setValue);
    setValue("buyerProfileId", undefined, { shouldValidate: true });
    return;
  }

  if (!supportsRent && supportsSale) {
    setContractTypeIfNeeded(contractType, "sale", setValue);
    setValue("tenantId", undefined, { shouldValidate: true });
    return;
  }

  if (contractType !== "rental" && contractType !== "sale") {
    setValue("contractType", "rental", { shouldValidate: true });
  }
}

function resolveContractType(
  shouldLock: boolean,
  hasPreselectedBuyer: boolean,
  supportsRent: boolean,
  supportsSale: boolean,
  formContractType: string,
): "rental" | "sale" {
  if (shouldLock) {
    return hasPreselectedBuyer ? "sale" : "rental";
  }
  if (supportsRent && !supportsSale) return "rental";
  if (!supportsRent && supportsSale) return "sale";
  return formContractType === "sale" ? "sale" : "rental";
}

function mergeOwnerIfMissing(currentOwners: Owner[], newOwner: Owner): Owner[] {
  if (currentOwners.some((owner) => owner.id === newOwner.id)) {
    return currentOwners;
  }
  return [newOwner, ...currentOwners];
}

function propertyMatchesOperation(
  property: Property,
  shouldLock: boolean,
  hasPreselectedBuyer: boolean,
): boolean {
  if (!shouldLock) return true;
  const requiredOperation = hasPreselectedBuyer ? "sale" : "rent";
  const ops = property.operations ?? [];
  return ops.length === 0 || ops.includes(requiredOperation);
}

function resolveTemplateId(
  isEditing: boolean,
  singleTemplate: LeaseTemplate | null,
  currentTemplateId: string | undefined,
  templatesForType: LeaseTemplate[],
): string | undefined {
  if (singleTemplate) {
    return currentTemplateId === singleTemplate.id
      ? undefined
      : singleTemplate.id;
  }
  if (isEditing) return undefined;

  const normalizedCurrent = currentTemplateId ?? "";
  const hasCurrentTemplate = templatesForType.some(
    (item) => item.id === normalizedCurrent,
  );
  if (hasCurrentTemplate) return undefined;

  const nextTemplateId = templatesForType[0]?.id ?? "";
  return normalizedCurrent === nextTemplateId ? undefined : nextTemplateId;
}

async function saveLease(
  isEditing: boolean,
  initialData: Lease | undefined,
  payload: LeaseFormData,
): Promise<string> {
  if (isEditing && initialData) {
    const updated = await leasesApi.update(initialData.id, payload);
    return updated.id;
  }
  const newLease = await leasesApi.create(payload as CreateLeaseInput);
  return newLease.id;
}

function applyPreselectedValues(
  isEditing: boolean,
  preselectedPropertyId: string | null,
  preselectedTenantId: string | null,
  preselectedBuyerProfileId: string | null,
  setValue: UseFormSetValue<LeaseFormData>,
): void {
  if (isEditing) return;
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
}

function syncOwnerFromProperty(
  selectedProperty: Property | undefined,
  selectedOwnerId: string | undefined,
  setValue: UseFormSetValue<LeaseFormData>,
): void {
  if (!selectedProperty?.ownerId) return;
  if (selectedOwnerId === selectedProperty.ownerId) return;
  setValue("ownerId", selectedProperty.ownerId, { shouldValidate: true });
}

function shouldTermsUpdate(
  selectedTemplate: LeaseTemplate | undefined,
  currentTerms: string | undefined,
  renderedTerms: string,
): boolean {
  if (!selectedTemplate) return false;
  return (currentTerms ?? "").trim() !== renderedTerms;
}

function findOwnerIdToFetch(
  selectedProperty: Property | undefined,
  owners: Owner[],
): string | null {
  if (!selectedProperty?.ownerId) return null;
  if (owners.some((owner) => owner.id === selectedProperty.ownerId))
    return null;
  return selectedProperty.ownerId;
}

async function fetchAndMergeOwner(
  ownerId: string,
  active: { current: boolean },
  setOwners: (updater: (prev: Owner[]) => Owner[]) => void,
): Promise<void> {
  try {
    const owner = await ownersApi.getById(ownerId);
    if (!owner || !active.current) return;
    setOwners((current) => mergeOwnerIfMissing(current, owner));
  } catch (error) {
    console.error("Failed to load owner for selected property", error);
  }
}

function ErrorMessage({ message }: { readonly message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

function LateFeeFields({
  register,
  lateFeeType,
  labelClass,
  inputClass,
  sectionClass,
  sectionTitleClass,
  t,
}: {
  readonly register: UseFormRegister<LeaseFormData>;
  readonly lateFeeType: string | undefined;
  readonly labelClass: string;
  readonly inputClass: string;
  readonly sectionClass: string;
  readonly sectionTitleClass: string;
  readonly t: (key: string) => string;
}) {
  return (
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
            <option value="percentage">{t("lateFeeTypes.percentage")}</option>
            <option value="daily_fixed">{t("lateFeeTypes.daily_fixed")}</option>
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
  );
}

function AdjustmentFields({
  register,
  adjustmentType,
  labelClass,
  inputClass,
  sectionClass,
  sectionTitleClass,
  t,
}: {
  readonly register: UseFormRegister<LeaseFormData>;
  readonly adjustmentType: string | undefined;
  readonly labelClass: string;
  readonly inputClass: string;
  readonly sectionClass: string;
  readonly sectionTitleClass: string;
  readonly t: (key: string) => string;
}) {
  return (
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
                  <option value="icl">{t("inflationIndexTypes.icl")}</option>
                  <option value="ipc">{t("inflationIndexTypes.ipc")}</option>
                  <option value="igp_m" disabled>
                    {t("inflationIndexTypes.igp_m_disabled")}
                  </option>
                </select>
              </div>
            )}

            <div>
              <label htmlFor="adjustmentFrequencyMonths" className={labelClass}>
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
  );
}

function resolveOwnerDisplayName(
  selectedOwner: Owner | undefined,
  preselectedOwnerName: string | null,
): string {
  if (!selectedOwner) return preselectedOwnerName ?? "-";
  const fullName =
    `${selectedOwner.firstName} ${selectedOwner.lastName}`.trim();
  return fullName || preselectedOwnerName || "-";
}

function resolveContractTypeHelperText(
  shouldLock: boolean,
  hasResolvable: boolean,
  t: (key: string) => string,
): string {
  if (shouldLock) return t("contractTypeFixedByInterested");
  if (hasResolvable) return t("contractTypeFixedByProperty");
  return t("selectProperty");
}

interface ContractPartyFieldsProps {
  readonly contractType: string;
  readonly hasPreselectedTenant: boolean;
  readonly hasPreselectedBuyer: boolean;
  readonly register: UseFormRegister<LeaseFormData>;
  readonly selectedTenantOption: LeaseTenantOption | undefined;
  readonly preselectedTenantId: string | null;
  readonly preselectedBuyerProfileId: string | null;
  readonly selectedBuyerOption: LeaseBuyerOption | undefined;
  readonly tenantOptions: readonly LeaseTenantOption[];
  readonly buyerOptions: readonly LeaseBuyerOption[];
  readonly inputClass: string;
  readonly readOnlyInputClass: string;
  readonly labelClass: string;
  readonly errors: FieldErrors<LeaseFormData>;
  readonly t: (key: string) => string;
}

function ContractPartyFields({
  contractType,
  hasPreselectedTenant,
  hasPreselectedBuyer,
  register,
  selectedTenantOption,
  preselectedTenantId,
  preselectedBuyerProfileId,
  selectedBuyerOption,
  tenantOptions,
  buyerOptions,
  inputClass,
  readOnlyInputClass,
  labelClass,
  errors,
  t,
}: ContractPartyFieldsProps) {
  if (contractType === "rental") {
    return (
      <>
        {hasPreselectedTenant ? (
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
            <ErrorMessage message={errors.tenantId?.message} />
          </div>
        )}
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
            <ErrorMessage message={errors.startDate?.message} />
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
            <ErrorMessage message={errors.endDate?.message} />
          </div>
        </div>
      </>
    );
  }

  return (
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
          <ErrorMessage message={errors.buyerProfileId?.message} />
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
        <ErrorMessage message={errors.fiscalValue?.message} />
      </div>
    </div>
  );
}

interface TermsSectionProps {
  readonly register: UseFormRegister<LeaseFormData>;
  readonly selectedTemplate: LeaseTemplate | undefined;
  readonly inputClass: string;
  readonly readOnlyInputClass: string;
  readonly labelClass: string;
  readonly sectionClass: string;
  readonly t: (key: string) => string;
}

function TermsSection({
  register,
  selectedTemplate,
  inputClass,
  readOnlyInputClass,
  labelClass,
  sectionClass,
  t,
}: TermsSectionProps) {
  const rows = selectedTemplate ? 12 : 6;
  const className = selectedTemplate ? readOnlyInputClass : inputClass;

  return (
    <div className={sectionClass}>
      <div>
        <label htmlFor="terms" className={labelClass}>
          {t("termsAndConditions")}
        </label>
        <textarea
          id="terms"
          {...register("terms")}
          rows={rows}
          readOnly={Boolean(selectedTemplate)}
          className={className}
          placeholder={t("leaseTermsPlaceholder")}
        />
        {selectedTemplate ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t("templateAutofillHint")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LeaseForm({ initialData, isEditing = false }: LeaseFormProps) {
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
  const selectedOwnerDisplayName = resolveOwnerDisplayName(
    selectedOwner,
    preselectedOwnerName,
  );
  const contractTypeHelperText = resolveContractTypeHelperText(
    shouldLockContractTypeByInterested,
    hasResolvableContractTypeFromProperty,
    t as (key: string) => string,
  );

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

        const resolvedProperties = await ensurePropertyLoaded(
          preselectedPropertyId,
          props,
        );

        const ownerIdFromPreselectedProperty = resolvedProperties.find(
          (property) => property.id === preselectedPropertyId,
        )?.ownerId;
        const resolvedOwners = await ensureOwnerLoaded(
          ownerIdFromPreselectedProperty,
          owns,
        );

        const profiles = interestedResponse.data;

        setProperties(resolvedProperties);
        setTenantOptions(buildTenantOptions(profiles));
        setBuyerOptions(buildBuyerOptions(profiles));
        setOwners(resolvedOwners);
        setTemplates(leaseTemplates);
      } catch (error) {
        console.error("Failed to load form data", error);
      }
    };
    loadData();
  }, [preselectedPropertyId]);

  useEffect(() => {
    const ownerIdToFetch = findOwnerIdToFetch(selectedProperty, owners);
    if (!ownerIdToFetch) return;

    const active = { current: true };
    void fetchAndMergeOwner(ownerIdToFetch, active, setOwners);
    return () => {
      active.current = false;
    };
  }, [owners, selectedProperty]);

  useEffect(() => {
    applyPreselectedValues(
      isEditing,
      preselectedPropertyId,
      preselectedTenantId,
      preselectedBuyerProfileId,
      setValue,
    );
  }, [
    isEditing,
    preselectedPropertyId,
    preselectedTenantId,
    preselectedBuyerProfileId,
    setValue,
  ]);

  useEffect(() => {
    syncOwnerFromProperty(selectedProperty, selectedOwnerId, setValue);
  }, [selectedOwnerId, selectedProperty, setValue]);

  useEffect(() => {
    syncContractType(
      selectedProperty,
      {
        shouldLock: shouldLockContractTypeByInterested,
        hasPreselectedTenant,
        hasPreselectedBuyer,
        contractType,
        supportsRent: selectedPropertySupportsRent,
        supportsSale: selectedPropertySupportsSale,
      },
      setValue,
    );
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
    const filtered = properties.filter((property) =>
      propertyMatchesOperation(
        property,
        shouldLockContractTypeByInterested,
        hasPreselectedBuyer,
      ),
    );

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
    const nextId = resolveTemplateId(
      isEditing,
      singleTemplateForType,
      selectedTemplateId,
      templatesForType,
    );
    if (nextId !== undefined) {
      setValue("templateId", nextId, { shouldValidate: true });
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
    if (
      shouldTermsUpdate(
        selectedTemplate,
        formValues.terms,
        renderedTemplateTerms,
      )
    ) {
      setValue("terms", renderedTemplateTerms, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [formValues.terms, renderedTemplateTerms, selectedTemplate, setValue]);

  const onSubmit = async (data: LeaseFormData) => {
    if (hasPreselectedProperty && !selectedProperty) {
      alert(t("unknownProperty"));
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedOwnerId = selectedProperty?.ownerId ?? data.ownerId;
      const resolvedContractType = resolveContractType(
        shouldLockContractTypeByInterested,
        hasPreselectedBuyer,
        selectedPropertySupportsRent,
        selectedPropertySupportsSale,
        data.contractType,
      );

      const payload: LeaseFormData = {
        ...data,
        ownerId: resolvedOwnerId,
        contractType: resolvedContractType,
        terms: selectedTemplate ? renderedTemplateTerms : data.terms,
      };

      const leaseId = await saveLease(isEditing, initialData, payload);
      router.push(`/leases/${leaseId}`);
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
              <ErrorMessage message={errors.propertyId?.message} />
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
            <ErrorMessage message={errors.contractType?.message} />
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
            <ErrorMessage message={errors.ownerId?.message} />
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

        <ContractPartyFields
          contractType={contractType}
          hasPreselectedTenant={hasPreselectedTenant}
          hasPreselectedBuyer={hasPreselectedBuyer}
          register={register}
          selectedTenantOption={selectedTenantOption}
          preselectedTenantId={preselectedTenantId}
          preselectedBuyerProfileId={preselectedBuyerProfileId}
          selectedBuyerOption={selectedBuyerOption}
          tenantOptions={tenantOptions}
          buyerOptions={buyerOptions}
          inputClass={inputClass}
          readOnlyInputClass={readOnlyInputClass}
          labelClass={labelClass}
          errors={errors}
          t={t as (key: string) => string}
        />

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
              <ErrorMessage message={errors.rentAmount?.message} />
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
            <ErrorMessage message={errors.depositAmount?.message} />
          </div>

          <div>
            <label htmlFor="currency" className={labelClass}>
              {tCurrencies("title")}
            </label>
            <CurrencySelect
              value={formValues.currency || "ARS"}
              onChange={(value) => setValue("currency", value)}
            />
            <ErrorMessage message={errors.currency?.message} />
          </div>
        </div>
      </div>

      {/* Billing, Late Fee, and Adjustment Configuration */}
      {contractType === "rental" && (
        <>
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
                  <option value="annual">
                    {t("paymentFrequencies.annual")}
                  </option>
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
                  <option value="custom">
                    {t("billingFrequencies.custom")}
                  </option>
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
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded-sm border"
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

          <LateFeeFields
            register={register}
            lateFeeType={lateFeeType}
            labelClass={labelClass}
            inputClass={inputClass}
            sectionClass={sectionClass}
            sectionTitleClass={sectionTitleClass}
            t={t as (key: string) => string}
          />

          <AdjustmentFields
            register={register}
            adjustmentType={adjustmentType}
            labelClass={labelClass}
            inputClass={inputClass}
            sectionClass={sectionClass}
            sectionTitleClass={sectionTitleClass}
            t={t as (key: string) => string}
          />
        </>
      )}

      {/* Terms and Conditions */}
      <TermsSection
        register={register}
        selectedTemplate={selectedTemplate}
        inputClass={inputClass}
        readOnlyInputClass={readOnlyInputClass}
        labelClass={labelClass}
        sectionClass={sectionClass}
        t={t as (key: string) => string}
      />

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
