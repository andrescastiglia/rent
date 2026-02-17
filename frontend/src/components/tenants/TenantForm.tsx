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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xs border border-gray-100 dark:border-gray-700"
    >
      {/* Personal Information */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t("personalInfo")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t("fields.firstName")}</label>
            <input {...register("firstName")} className={inputClass} />
            {errors.firstName && (
              <p className="mt-1 text-sm text-red-600">
                {errors.firstName.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>{t("fields.lastName")}</label>
            <input {...register("lastName")} className={inputClass} />
            {errors.lastName && (
              <p className="mt-1 text-sm text-red-600">
                {errors.lastName.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>{t("fields.email")}</label>
            <input
              {...register("email")}
              type="email"
              className={inputClass}
              disabled={isEditing}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>{t("fields.phone")}</label>
            <input {...register("phone")} className={inputClass} />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">
                {errors.phone.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>{t("fields.dni")}</label>
            <input {...register("dni")} className={inputClass} />
            {errors.dni && (
              <p className="mt-1 text-sm text-red-600">{errors.dni.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>{t("fields.cuil")}</label>
            <input
              {...register("cuil")}
              className={inputClass}
              placeholder="20-12345678-9"
            />
          </div>

          <div>
            <label className={labelClass}>{t("fields.dateOfBirth")}</label>
            <input
              {...register("dateOfBirth")}
              type="date"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t("fields.nationality")}</label>
            <input {...register("nationality")} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{t("fields.status")}</label>
            <select {...register("status")} className={inputClass}>
              <option value="PROSPECT">{t("status.PROSPECT")}</option>
              <option value="ACTIVE">{t("status.ACTIVE")}</option>
              <option value="INACTIVE">{t("status.INACTIVE")}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employment Information */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t("employmentInfo")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t("fields.employmentStatus")}</label>
            <select {...register("employmentStatus")} className={inputClass}>
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
            <label className={labelClass}>{t("fields.occupation")}</label>
            <input {...register("occupation")} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{t("fields.employer")}</label>
            <input {...register("employer")} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{t("fields.monthlyIncome")}</label>
            <input
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
        <h3 className={sectionTitleClass}>{t("creditInfo")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t("fields.creditScore")}</label>
            <input
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
        <h3 className={sectionTitleClass}>{t("addressOptional")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t("fields.street")}</label>
            <input {...register("address.street")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.number")}</label>
            <input {...register("address.number")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.city")}</label>
            <input {...register("address.city")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.state")}</label>
            <input {...register("address.state")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.zipCode")}</label>
            <input {...register("address.zipCode")} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className={sectionClass}>
        <h3 className={sectionTitleClass}>{t("emergencyContactSection")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>
              {t("fields.emergencyContactName")}
            </label>
            <input
              {...register("emergencyContactName")}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              {t("fields.emergencyContactPhone")}
            </label>
            <input
              {...register("emergencyContactPhone")}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              {t("fields.emergencyContactRelationship")}
            </label>
            <input
              {...register("emergencyContactRelationship")}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className={sectionClass}>
        <div>
          <label className={labelClass}>{t("fields.notes")}</label>
          <textarea {...register("notes")} rows={3} className={inputClass} />
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
