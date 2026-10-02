import type {
  MercadoLibreCategoryDto,
  PortalListing,
} from "@/generated/openapi";
import type { Property } from "@/types/property";
export type AttributeValue = { value: string; unit: string };
export type ListingForm = {
  title: string;
  description: string;
  price: string;
  currency: string;
  categoryId: string;
  listingType: string;
  pictures: string;
  contact: string;
  areaCode: string;
  phone: string;
  countryCode: string;
  areaCode2: string;
  phone2: string;
  countryCode2: string;
  email: string;
  address: string;
  zipCode: string;
  stateId: string;
  cityId: string;
  neighborhoodId: string;
  replaceLocation: boolean;
  attributes: Record<string, AttributeValue>;
};
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function initialListingForm(
  property: Property,
  listing: PortalListing | null,
): ListingForm {
  const data = record(listing?.listingData);
  const item = record(data.item);
  const contact = record(item.seller_contact);
  const location = record(item.location);
  const pictures = Array.isArray(item.pictures)
    ? item.pictures.map((value) => string(record(value).source))
    : property.images;
  return {
    title: string(item.title) || property.name,
    description: string(data.description) || property.description || "",
    price: typeof item.price === "number" ? String(item.price) : "",
    currency: string(item.currency_id) || "ARS",
    categoryId: string(item.category_id) || "MLA1459",
    listingType: string(item.listing_type_id),
    pictures: pictures.join("\n"),
    contact: string(contact.contact),
    areaCode: string(contact.area_code),
    phone: string(contact.phone),
    countryCode: string(contact.country_code) || "54",
    areaCode2: string(contact.area_code2),
    phone2: string(contact.phone2),
    countryCode2: string(contact.country_code2) || "54",
    email: string(contact.email),
    address:
      string(location.address_line) ||
      [property.address.street, property.address.number]
        .filter(Boolean)
        .join(" "),
    zipCode: string(location.zip_code) || property.address.zipCode,
    stateId: "",
    cityId: string(record(location.city).id),
    neighborhoodId: string(record(location.neighborhood).id),
    replaceLocation: !Object.keys(location).length,
    attributes: {},
  };
}
export function attributeDefaults(
  category: MercadoLibreCategoryDto,
  listing: PortalListing | null,
): Record<string, AttributeValue> {
  const item = record(listing?.listingData.item);
  const saved =
    item.category_id === category.id && Array.isArray(item.attributes)
      ? item.attributes
      : [];
  return Object.fromEntries(
    category.attributes.map((attribute) => {
      const old = record(
        saved.find((value) => record(value).id === attribute.id),
      );
      let value = attribute.values.length
        ? string(old.value_id)
        : string(old.value_name);
      const unit =
        attribute.units.find((option) => value.endsWith(` ${option.id}`))?.id ??
        attribute.defaultUnit ??
        attribute.units[0]?.id ??
        "";
      if (attribute.valueType === "number_unit" && value.endsWith(` ${unit}`))
        value = value.slice(0, -unit.length - 1);
      if (attribute.readOnly && !value && attribute.values.length === 1)
        value = attribute.values[0].id;
      return [attribute.id, { value, unit }];
    }),
  );
}
type CategoryAttribute = MercadoLibreCategoryDto["attributes"][number];
function listingPictures(form: ListingForm): string[] {
  const pictures = form.pictures
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!pictures.length || pictures.length > 100) throw new Error("invalid");
  for (const picture of pictures) {
    const url = new URL(picture);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("invalid");
  }
  return pictures;
}
function validateListing(
  form: ListingForm,
  category: MercadoLibreCategoryDto,
  published: boolean,
  price: number,
) {
  if (
    !form.title.trim() ||
    !form.description.trim() ||
    !Number.isFinite(price) ||
    price <= 0 ||
    category.id !== form.categoryId
  )
    throw new Error("invalid");
  if (
    !published &&
    (!category.listingAllowed ||
      !category.currencies.includes(form.currency) ||
      !category.listingTypes.some((type) => type.id === form.listingType))
  )
    throw new Error("invalid");
}
function editableAttribute(
  attribute: CategoryAttribute,
  current: AttributeValue | undefined,
): Record<string, unknown> | null {
  const value = current?.value?.trim() ?? "";
  if (!value) {
    if (attribute.required) throw new Error("invalid");
    return null;
  }
  if (value.length > attribute.maxLength) throw new Error("invalid");
  if (attribute.values.length) {
    if (!attribute.values.some((option) => option.id === value))
      throw new Error("invalid");
    return { id: attribute.id, value_id: value };
  }
  if (
    ["number", "number_unit"].includes(attribute.valueType) &&
    !Number.isFinite(Number(value))
  )
    throw new Error("invalid");
  if (
    attribute.valueType === "number_unit" &&
    !attribute.units.some((unit) => unit.id === current?.unit)
  )
    throw new Error("invalid");
  const valueName =
    attribute.valueType === "number_unit" ? `${value} ${current!.unit}` : value;
  return { id: attribute.id, value_name: valueName };
}
function readOnlyAttribute(
  attribute: CategoryAttribute,
  current: AttributeValue | undefined,
  saved: unknown[],
  sameCategory: boolean,
): Record<string, unknown> | null {
  const previous = saved.find((entry) => record(entry).id === attribute.id);
  if (previous && sameCategory) return record(previous);
  const value = current?.value?.trim() ?? "";
  if (!value) return null;
  return {
    id: attribute.id,
    ...(attribute.values.length ? { value_id: value } : { value_name: value }),
  };
}
function listingAttributes(
  form: ListingForm,
  category: MercadoLibreCategoryDto,
  original: Record<string, unknown>,
): Record<string, unknown>[] {
  const saved = Array.isArray(original.attributes) ? original.attributes : [];
  const sameCategory = original.category_id === category.id;
  const attributes = sameCategory
    ? saved
        .filter(
          (value) =>
            !category.attributes.some(
              (attribute) => attribute.id === record(value).id,
            ),
        )
        .map(record)
    : [];
  for (const attribute of category.attributes) {
    const current = form.attributes[attribute.id];
    const value = attribute.readOnly
      ? readOnlyAttribute(attribute, current, saved, sameCategory)
      : editableAttribute(attribute, current);
    if (value) attributes.push(value);
  }
  return attributes;
}
function listingLocation(
  form: ListingForm,
  original: Record<string, unknown>,
  published: boolean,
): Record<string, unknown> {
  if (published || !form.replaceLocation) return record(original.location);
  if (!form.stateId || !form.cityId || !form.address.trim())
    throw new Error("invalid");
  return {
    address_line: form.address.trim(),
    ...(form.zipCode.trim() ? { zip_code: form.zipCode.trim() } : {}),
    city: { id: form.cityId },
    ...(form.neighborhoodId
      ? { neighborhood: { id: form.neighborhoodId } }
      : {}),
  };
}
function listingContact(
  form: ListingForm,
  original: Record<string, unknown>,
  published: boolean,
): unknown {
  if (published) return original.seller_contact;
  if (
    !form.contact.trim() ||
    !form.areaCode.trim() ||
    !form.phone.trim() ||
    !form.countryCode2.trim() ||
    !form.phone2.trim()
  )
    throw new Error("invalid");
  return {
    ...record(original.seller_contact),
    contact: form.contact.trim(),
    area_code: form.areaCode.trim(),
    phone: form.phone.trim(),
    country_code: form.countryCode.trim() || undefined,
    country_code2: form.countryCode2.trim(),
    area_code2: form.areaCode2.trim(),
    phone2: form.phone2.trim(),
    email: form.email.trim() || undefined,
  };
}
export function listingPayload(
  form: ListingForm,
  category: MercadoLibreCategoryDto,
  listing: PortalListing | null,
): Record<string, unknown> {
  const published = !!listing?.externalId;
  const original = record(listing?.listingData.item);
  const price = Number(form.price);
  const pictures = listingPictures(form);
  validateListing(form, category, published, price);
  return {
    item: {
      ...original,
      title: form.title.trim(),
      price,
      currency_id: published ? original.currency_id : form.currency,
      category_id: published ? original.category_id : category.id,
      listing_type_id: published ? original.listing_type_id : form.listingType,
      available_quantity: 1,
      buying_mode: "classified",
      condition: "not_specified",
      pictures: pictures.map((source) => ({ source })),
      seller_contact: listingContact(form, original, published),
      location: listingLocation(form, original, published),
      attributes: listingAttributes(form, category, original),
    },
    description: form.description.trim(),
  };
}
