"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useForm, useFieldArray, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreatePropertyInput, Property } from "@/types/property";
import { ImageUpload } from "./ImageUpload";
import { propertiesApi } from "@/lib/api/properties";
import { ownersApi } from "@/lib/api/owners";
import { useLocalizedRouter } from "@/hooks/useLocalizedRouter";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createPropertySchema,
  PropertyFormData,
} from "@/lib/validation-schemas";
import { Owner } from "@/types/owner";
import { useAuth } from "@/contexts/auth-context";
import { useSearchParams } from "next/navigation";
import { CurrencySelect } from "@/components/common/CurrencySelect";

interface PropertyFormProps {
  initialData?: Property;
  isEditing?: boolean;
}

export function PropertyForm({
  initialData,
  isEditing = false,
}: PropertyFormProps) {
  const router = useLocalizedRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const t = useTranslations("properties");
  const tCommon = useTranslations("common");
  const tValidation = useTranslations("validation");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = React.useState<
    string | null
  >(null);
  const [owners, setOwners] = React.useState<Owner[]>([]);
  const [uploadedSessionImages, setUploadedSessionImages] = React.useState<
    string[]
  >([]);
  const uploadedSessionImagesRef = useRef<string[]>([]);
  const persistedRef = useRef(false);

  // Crear schema con mensajes traducidos
  const propertySchema = useMemo(
    () => createPropertySchema(tValidation),
    [tValidation],
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    clearErrors,
    formState: { errors },
  } = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema) as Resolver<PropertyFormData>,
    defaultValues: initialData
      ? {
          ...initialData,
          features: initialData.features.map((f) => ({
            name: f.name,
            value: f.value,
          })),
          ownerWhatsapp: initialData.ownerWhatsapp ?? "",
          salePrice: initialData.salePrice ?? undefined,
          saleCurrency: initialData.saleCurrency ?? "ARS",
          operations: initialData.operations ?? ["rent"],
          operationState: initialData.operationState ?? "available",
          allowsPets: initialData.allowsPets ?? true,
          acceptedGuaranteeTypes: initialData.acceptedGuaranteeTypes ?? [],
          maxOccupants: initialData.maxOccupants ?? undefined,
        }
      : {
          type: "APARTMENT",
          status: "ACTIVE",
          images: [],
          features: [],
          ownerId: "",
          ownerWhatsapp: "",
          salePrice: undefined,
          saleCurrency: "ARS",
          operations: ["rent"],
          operationState: "available",
          allowsPets: true,
          acceptedGuaranteeTypes: [],
          maxOccupants: undefined,
          address: {
            country: "Argentina", // Default
          },
        },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "features",
  });

  const images = watch("images") || [];
  const selectedOperations = watch("operations") || [];
  const isSaleOperationSelected = selectedOperations.includes("sale");
  const selectedOwnerId = watch("ownerId");
  const preselectedOwnerId = searchParams.get("ownerId");
  const isOwnerLocked = isEditing || Boolean(preselectedOwnerId);
  const activeOwnerId = isEditing
    ? (initialData?.ownerId ?? selectedOwnerId)
    : (preselectedOwnerId ?? selectedOwnerId);
  const activeOwner = useMemo(
    () => owners.find((owner) => owner.id === activeOwnerId),
    [activeOwnerId, owners],
  );

  useEffect(() => {
    uploadedSessionImagesRef.current = uploadedSessionImages;
  }, [uploadedSessionImages]);

  useEffect(() => {
    return () => {
      if (
        !persistedRef.current &&
        uploadedSessionImagesRef.current.length > 0
      ) {
        void propertiesApi.discardUploadedImages(
          uploadedSessionImagesRef.current,
        );
      }
    };
  }, []);

  useEffect(() => {
    const loadOwners = async () => {
      try {
        const data = await ownersApi.getAll();
        setOwners(data);
      } catch (error) {
        console.error("Failed to load owners", error);
      }
    };
    void loadOwners();
  }, []);

  useEffect(() => {
    if (isEditing) return;
    if (!preselectedOwnerId) return;
    setValue("ownerId", preselectedOwnerId, { shouldValidate: true });
  }, [isEditing, preselectedOwnerId, setValue]);

  useEffect(() => {
    if (!isOwnerLocked || !activeOwner) return;
    setValue("ownerWhatsapp", activeOwner.phone ?? "", {
      shouldValidate: true,
    });
  }, [activeOwner, isOwnerLocked, setValue]);

  useEffect(() => {
    if (isSaleOperationSelected) return;
    setValue("salePrice", undefined);
    clearErrors("salePrice");
  }, [clearErrors, isSaleOperationSelected, setValue]);

  const handleToggleOperation = (operation: "rent" | "sale") => {
    if (
      selectedOperations.includes(operation) &&
      selectedOperations.length === 1
    ) {
      return;
    }
    const nextOperations = selectedOperations.includes(operation)
      ? selectedOperations.filter((item) => item !== operation)
      : [...selectedOperations, operation];
    setValue("operations", nextOperations, { shouldValidate: true });
  };

  const onSubmit = async (data: PropertyFormData) => {
    setSubmitErrorMessage(null);
    if (user?.role === "admin" && !data.ownerId) {
      alert(tValidation("ownerRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload =
        isOwnerLocked && activeOwner
          ? {
              ...data,
              ownerId: activeOwner.id,
              ownerWhatsapp: activeOwner.phone ?? undefined,
            }
          : data;

      if (isEditing && initialData) {
        await propertiesApi.update(initialData.id, payload);
        router.push(`/properties/${initialData.id}`);
      } else {
        const newProperty = await propertiesApi.create(
          payload as CreatePropertyInput,
        );
        router.push(`/properties/${newProperty.id}`);
      }

      const currentImages = Array.isArray(payload.images) ? payload.images : [];
      const discardedBeforePersist = uploadedSessionImagesRef.current.filter(
        (imageUrl) => !currentImages.includes(imageUrl),
      );
      if (discardedBeforePersist.length > 0) {
        await propertiesApi.discardUploadedImages(discardedBeforePersist);
      }

      persistedRef.current = true;
      setUploadedSessionImages([]);
      router.refresh();
    } catch (error) {
      console.error("Error saving property:", error);
      alert(tCommon("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalid = () => {
    setSubmitErrorMessage(tValidation("required"));
  };

  const handleImageUpload = async (file: File) => {
    const url = await propertiesApi.uploadImage(file);
    setUploadedSessionImages((prev) =>
      prev.includes(url) ? prev : [...prev, url],
    );
    return url;
  };

  const handleImageRemove = async () => {
    // Image references are persisted only when the form is saved.
    // Uploads removed before save are discarded on save/cancel cleanup.
  };

  const handleCancel = async () => {
    if (uploadedSessionImagesRef.current.length > 0) {
      await propertiesApi.discardUploadedImages(
        uploadedSessionImagesRef.current,
      );
      setUploadedSessionImages([]);
    }
    router.back();
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      className="space-y-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xs border border-gray-100 dark:border-gray-700"
    >
      {submitErrorMessage ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {submitErrorMessage}
        </p>
      ) : null}
      <input type="hidden" {...register("ownerId")} />
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">
          {t("basicInfo")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.name")}
            </label>
            <input
              id="name"
              {...register("name")}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              placeholder={t("placeholders.name")}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="ownerWhatsapp"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.ownerWhatsapp")}
            </label>
            {isOwnerLocked ? (
              <p className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs sm:text-sm border p-2 bg-gray-100 dark:bg-gray-900/40 dark:text-white">
                {activeOwner?.phone || "-"}
              </p>
            ) : (
              <input
                id="ownerWhatsapp"
                {...register("ownerWhatsapp")}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
                placeholder={t("placeholders.ownerWhatsapp")}
              />
            )}
            {errors.ownerWhatsapp && (
              <p className="mt-1 text-sm text-red-600">
                {errors.ownerWhatsapp.message}
              </p>
            )}
          </div>

          {isOwnerLocked ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("fields.owner")}
              </label>
              <p className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs sm:text-sm border p-2 bg-gray-100 dark:bg-gray-900/40 dark:text-white">
                {activeOwner
                  ? `${activeOwner.firstName} ${activeOwner.lastName}`.trim()
                  : "-"}
              </p>
            </div>
          ) : user?.role === "admin" ? (
            <div>
              <label
                htmlFor="ownerId"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("fields.owner")}
              </label>
              <select
                id="ownerId"
                {...register("ownerId")}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              >
                <option value="">{t("selectOwner")}</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.firstName} {owner.lastName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.type")}
            </label>
            <select
              id="type"
              {...register("type")}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            >
              <option value="APARTMENT">{t("types.APARTMENT")}</option>
              <option value="HOUSE">{t("types.HOUSE")}</option>
              <option value="COMMERCIAL">{t("types.COMMERCIAL")}</option>
              <option value="OFFICE">{t("types.OFFICE")}</option>
              <option value="WAREHOUSE">{t("types.WAREHOUSE")}</option>
              <option value="LAND">{t("types.LAND")}</option>
              <option value="PARKING">{t("types.PARKING")}</option>
              <option value="OTHER">{t("types.OTHER")}</option>
            </select>
            {errors.type && (
              <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="salePrice"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.salePrice")}
            </label>
            <input
              id="salePrice"
              type="number"
              min="0"
              step="0.01"
              disabled={!isSaleOperationSelected}
              {...register("salePrice", {
                setValueAs: (value) =>
                  value === "" || value === null ? undefined : Number(value),
              })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed dark:disabled:bg-gray-900/40 dark:disabled:text-gray-400"
              placeholder={t("placeholders.salePrice")}
            />
            {errors.salePrice && (
              <p className="mt-1 text-sm text-red-600">
                {errors.salePrice.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="saleCurrency"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.saleCurrency")}
            </label>
            <div className="mt-1">
              <CurrencySelect
                id="saleCurrency"
                name="saleCurrency"
                value={watch("saleCurrency") || ""}
                onChange={(value) =>
                  setValue("saleCurrency", value, { shouldValidate: true })
                }
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <p className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("fields.operations")}
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              {(["rent", "sale"] as const).map((operation) => (
                <label
                  key={operation}
                  className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedOperations.includes(operation)}
                    onChange={() => handleToggleOperation(operation)}
                    className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t(`operations.${operation}`)}
                </label>
              ))}
            </div>
            {errors.operations && (
              <p className="mt-1 text-sm text-red-600">
                {errors.operations.message as string}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="allowsPets"
              type="checkbox"
              {...register("allowsPets")}
              className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label
              htmlFor="allowsPets"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.allowsPets")}
            </label>
          </div>

          <div>
            <label
              htmlFor="acceptedGuaranteeTypes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.acceptedGuaranteeTypes")}
            </label>
            <input
              id="acceptedGuaranteeTypes"
              {...register("acceptedGuaranteeTypes")}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              placeholder={t("placeholders.acceptedGuaranteeTypes")}
              onChange={(event) =>
                setValue(
                  "acceptedGuaranteeTypes",
                  event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>

          <div>
            <label
              htmlFor="maxOccupants"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.maxOccupants")}
            </label>
            <input
              id="maxOccupants"
              type="number"
              min="1"
              {...register("maxOccupants", {
                setValueAs: (value) =>
                  value === "" || value === null ? undefined : Number(value),
              })}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              placeholder={t("placeholders.maxOccupants")}
            />
          </div>

          {isEditing && (
            <div>
              <label
                htmlFor="status"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("fields.status")}
              </label>
              <select
                id="status"
                {...register("status")}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              >
                <option value="ACTIVE">{t("status.ACTIVE")}</option>
                <option value="INACTIVE">{t("status.INACTIVE")}</option>
                <option value="MAINTENANCE">{t("status.MAINTENANCE")}</option>
              </select>
            </div>
          )}

          {isEditing && (
            <div>
              <label
                htmlFor="operationState"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("fields.operationState")}
              </label>
              <select
                id="operationState"
                {...register("operationState")}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              >
                <option value="available">
                  {t("operationState.available")}
                </option>
                <option value="rented">{t("operationState.rented")}</option>
                <option value="reserved">{t("operationState.reserved")}</option>
                <option value="sold">{t("operationState.sold")}</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t("fields.description")}
          </label>
          <textarea
            id="description"
            {...register("description")}
            rows={3}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            placeholder={t("placeholders.description")}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">
          {t("location")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="street"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.street")}
            </label>
            <input
              id="street"
              {...register("address.street")}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.address?.street && (
              <p className="mt-1 text-sm text-red-600">
                {errors.address.street.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="number"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("fields.number")}
              </label>
              <input
                id="number"
                {...register("address.number")}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              />
              {errors.address?.number && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.address.number.message}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="unit"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t("fields.unit")} ({tCommon("optional")})
              </label>
              <input
                id="unit"
                {...register("address.unit")}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="city"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.city")}
            </label>
            <input
              id="city"
              {...register("address.city")}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.address?.city && (
              <p className="mt-1 text-sm text-red-600">
                {errors.address.city.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="state"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.state")}
            </label>
            <input
              id="state"
              {...register("address.state")}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.address?.state && (
              <p className="mt-1 text-sm text-red-600">
                {errors.address.state.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="zipCode"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.zipCode")}
            </label>
            <input
              id="zipCode"
              {...register("address.zipCode")}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.address?.zipCode && (
              <p className="mt-1 text-sm text-red-600">
                {errors.address.zipCode.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="country"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t("fields.country")}
            </label>
            <input
              id="country"
              {...register("address.country")}
              className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
            />
            {errors.address?.country && (
              <p className="mt-1 text-sm text-red-600">
                {errors.address.country.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">
          {t("fields.images")}
        </h3>
        <ImageUpload
          images={images}
          onChange={(newImages) => setValue("images", newImages)}
          onUpload={handleImageUpload}
          onRemove={handleImageRemove}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b dark:border-gray-700 pb-2">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {t("features")}
          </h3>
          <button
            type="button"
            onClick={() => append({ name: "", value: "" })}
            className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 dark:text-blue-300 dark:bg-blue-900 dark:hover:bg-blue-800 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus size={16} className="mr-1" />
            {t("addFeature")}
          </button>
        </div>

        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  {...register(`features.${index}.name`)}
                  placeholder={t("fields.featureName")}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
                />
                {errors.features?.[index]?.name && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.features[index]?.name?.message}
                  </p>
                )}
              </div>
              <div className="flex-1">
                <input
                  {...register(`features.${index}.value`)}
                  placeholder={`${t("fields.featureValue")} (${tCommon("optional")})`}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(index)}
                className="p-2 text-red-600 hover:text-red-800"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              {t("noFeatures")}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t dark:border-gray-700">
        <button
          type="button"
          onClick={() => void handleCancel()}
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
            t("saveProperty")
          )}
        </button>
      </div>
    </form>
  );
}
