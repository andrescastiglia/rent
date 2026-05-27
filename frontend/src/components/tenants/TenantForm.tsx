"use client";

import React, { useMemo } from "react";
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateTenantInput, Tenant } from "@/types/tenant";
import { tenantsApi } from "@/lib/api/tenants";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createTenantSchema } from "@/lib/validation-schemas";
import * as z from "zod";

// Extender el schema base para incluir todos los campos necesarios
const createExtendedTenantSchema = (
  t: (key: string, params?: Record<string, string | number>) => string,
) => {
  const baseSchema = createTenantSchema(t);
  return baseSchema.extend({
    status: z.enum(["ACTIVE", "INACTIVE", "PROSPECT"] as const),
    cuil: z.string().optional(),
    dateOfBirth: z.string().optional(),
    nationality: z.string().optional(),
    address: z
      .object({
        street: z.string().optional(),
        number: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
      })
      .optional(),
    // Employment fields
    occupation: z.string().optional(),
    employer: z.string().optional(),
    monthlyIncome: z.preprocess((value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }
      return Number(value);
    }, z.number().min(0).optional()),
    employmentStatus: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .enum([
          "employed",
          "self_employed",
          "unemployed",
          "retired",
          "student",
        ] as const)
        .optional(),
    ),
    // Emergency contact
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    emergencyContactRelationship: z.string().optional(),
    // Credit
    creditScore: z.preprocess((value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }
      return Number(value);
    }, z.number().min(0).max(1000).optional()),
    notes: z.string().optional(),
  });
};

type ExtendedTenantFormData = z.infer<
  ReturnType<typeof createExtendedTenantSchema>
>;

interface TenantFormProps {
  readonly initialData?: Tenant;
  readonly isEditing?: boolean;
}

export function TenantForm({
  initialData,
  isEditing = false,
}: TenantFormProps) {
  const router = useLocalizedRouter();
  const t = useTranslations("tenants");
  const tCommon = useTranslations("common");
  const tValidation = useTranslations("validation");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Crear schema con mensajes traducidos
  const tenantSchema = useMemo(
    () => createExtendedTenantSchema(tValidation),
    [tValidation],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExtendedTenantFormData>({
    resolver: zodResolver(tenantSchema) as Resolver<ExtendedTenantFormData>,
    defaultValues: initialData || {
      status: "PROSPECT",
    },
  });

  const onSubmit = async (data: ExtendedTenantFormData) => {
    setIsSubmitting(true);
    try {
      // Clean up empty address fields
      const cleanData = { ...data };
      if (
        cleanData.address &&
        (!cleanData.address.street || !cleanData.address.city)
      ) {
        delete cleanData.address;
      }

      if (isEditing && initialData) {
        await tenantsApi.update(
          initialData.id,
          cleanData as unknown as Partial<CreateTenantInput>,
        );
        router.push(`/tenants/${initialData.id}`);
      } else {
        await tenantsApi.create(cleanData as CreateTenantInput);
        router.push("/tenants");
      }
      router.refresh();
    } catch (error) {
      console.error("Error saving tenant:", error);
      alert(tCommon("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white";
  const labelClass =
    "block text-sm font-medium text-gray-700 dark:text-gray-300";
  const sectionClass = "space-y-4";
  const sectionTitleClass =
    "text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2";
  const errorClass = "mt-1 text-sm text-red-600";
  const getErrorId = (id: string, hasError: boolean) =>
    hasError ? `${id}-error` : undefined;
  const renderError = (id: string, message?: React.ReactNode) =>
    message ? (
      <p id={`${id}-error`} className={errorClass}>
        {message}
      </p>
    ) : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xs border border-gray-100 dark:border-gray-700"
    >
      {/* Personal Information */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>{t("personalInfo")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tenant-first-name" className={labelClass}>
              {t("fields.firstName")}
            </label>
            <input
              id="tenant-first-name"
              {...register("firstName")}
              className={inputClass}
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={getErrorId(
                "tenant-first-name",
                Boolean(errors.firstName),
              )}
            />
            {renderError("tenant-first-name", errors.firstName?.message)}
          </div>

          <div>
            <label htmlFor="tenant-last-name" className={labelClass}>
              {t("fields.lastName")}
            </label>
            <input
              id="tenant-last-name"
              {...register("lastName")}
              className={inputClass}
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={getErrorId(
                "tenant-last-name",
                Boolean(errors.lastName),
              )}
            />
            {renderError("tenant-last-name", errors.lastName?.message)}
          </div>

          <div>
            <label htmlFor="tenant-email" className={labelClass}>
              {t("fields.email")}
            </label>
            <input
              id="tenant-email"
              {...register("email")}
              type="email"
              className={inputClass}
              disabled={isEditing}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={getErrorId(
                "tenant-email",
                Boolean(errors.email),
              )}
            />
            {renderError("tenant-email", errors.email?.message)}
          </div>

          <div>
            <label htmlFor="tenant-phone" className={labelClass}>
              {t("fields.phone")}
            </label>
            <input
              id="tenant-phone"
              {...register("phone")}
              className={inputClass}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={getErrorId(
                "tenant-phone",
                Boolean(errors.phone),
              )}
            />
            {renderError("tenant-phone", errors.phone?.message)}
          </div>

          <div>
            <label htmlFor="tenant-dni" className={labelClass}>
              {t("fields.dni")}
            </label>
            <input
              id="tenant-dni"
              {...register("dni")}
              className={inputClass}
              aria-invalid={Boolean(errors.dni)}
              aria-describedby={getErrorId("tenant-dni", Boolean(errors.dni))}
            />
            {renderError("tenant-dni", errors.dni?.message)}
          </div>

          <div>
            <label htmlFor="tenant-cuil" className={labelClass}>
              {t("fields.cuil")}
            </label>
            <input
              id="tenant-cuil"
              {...register("cuil")}
              className={inputClass}
              placeholder="20-12345678-9"
            />
          </div>

          <div>
            <label htmlFor="tenant-date-of-birth" className={labelClass}>
              {t("fields.dateOfBirth")}
            </label>
            <input
              id="tenant-date-of-birth"
              {...register("dateOfBirth")}
              type="date"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="tenant-nationality" className={labelClass}>
              {t("fields.nationality")}
            </label>
            <input
              id="tenant-nationality"
              {...register("nationality")}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="tenant-status" className={labelClass}>
              {t("fields.status")}
            </label>
            <select
              id="tenant-status"
              {...register("status")}
              className={inputClass}
            >
              <option value="PROSPECT">{t("status.PROSPECT")}</option>
              <option value="ACTIVE">{t("status.ACTIVE")}</option>
              <option value="INACTIVE">{t("status.INACTIVE")}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employment Information */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>{t("employmentInfo")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tenant-employment-status" className={labelClass}>
              {t("fields.employmentStatus")}
            </label>
            <select
              id="tenant-employment-status"
              {...register("employmentStatus")}
              className={inputClass}
            >
              <option value="">-</option>
              <option value="employed">
                {t("employmentStatuses.employed")}
              </option>
              <option value="self_employed">
                {t("employmentStatuses.self_employed")}
              </option>
              <option value="unemployed">
                {t("employmentStatuses.unemployed")}
              </option>
              <option value="retired">{t("employmentStatuses.retired")}</option>
              <option value="student">{t("employmentStatuses.student")}</option>
            </select>
          </div>

          <div>
            <label htmlFor="tenant-occupation" className={labelClass}>
              {t("fields.occupation")}
            </label>
            <input
              id="tenant-occupation"
              {...register("occupation")}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="tenant-employer" className={labelClass}>
              {t("fields.employer")}
            </label>
            <input
              id="tenant-employer"
              {...register("employer")}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="tenant-monthly-income" className={labelClass}>
              {t("fields.monthlyIncome")}
            </label>
            <input
              id="tenant-monthly-income"
              {...register("monthlyIncome")}
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Credit Information */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>{t("creditInfo")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tenant-credit-score" className={labelClass}>
              {t("fields.creditScore")}
            </label>
            <input
              id="tenant-credit-score"
              {...register("creditScore")}
              type="number"
              min="0"
              max="1000"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Address */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>{t("addressOptional")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="tenant-address-street" className={labelClass}>
              {t("fields.street")}
            </label>
            <input
              id="tenant-address-street"
              {...register("address.street")}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="tenant-address-number" className={labelClass}>
              {t("fields.number")}
            </label>
            <input
              id="tenant-address-number"
              {...register("address.number")}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="tenant-address-city" className={labelClass}>
              {t("fields.city")}
            </label>
            <input
              id="tenant-address-city"
              {...register("address.city")}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="tenant-address-state" className={labelClass}>
              {t("fields.state")}
            </label>
            <input
              id="tenant-address-state"
              {...register("address.state")}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="tenant-address-zip-code" className={labelClass}>
              {t("fields.zipCode")}
            </label>
            <input
              id="tenant-address-zip-code"
              {...register("address.zipCode")}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className={sectionClass}>
        <h2 className={sectionTitleClass}>{t("emergencyContactSection")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="tenant-emergency-contact-name"
              className={labelClass}
            >
              {t("fields.emergencyContactName")}
            </label>
            <input
              id="tenant-emergency-contact-name"
              {...register("emergencyContactName")}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="tenant-emergency-contact-phone"
              className={labelClass}
            >
              {t("fields.emergencyContactPhone")}
            </label>
            <input
              id="tenant-emergency-contact-phone"
              {...register("emergencyContactPhone")}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="tenant-emergency-contact-relationship"
              className={labelClass}
            >
              {t("fields.emergencyContactRelationship")}
            </label>
            <input
              id="tenant-emergency-contact-relationship"
              {...register("emergencyContactRelationship")}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className={sectionClass}>
        <div>
          <label htmlFor="tenant-notes" className={labelClass}>
            {t("fields.notes")}
          </label>
          <textarea
            id="tenant-notes"
            {...register("notes")}
            rows={3}
            className={inputClass}
          />
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
            t("saveTenant")
          )}
        </button>
      </div>
    </form>
  );
}
