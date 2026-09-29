import {
  attributeDefaults,
  initialListingForm,
  listingPayload,
  record,
  type ListingForm,
} from "./mercadolibre-listing";
import type {
  MercadoLibreCategoryDto,
  PortalListing,
} from "@/generated/openapi";
import type { Property } from "@/types/property";
const property = {
  id: "property",
  name: "Casa",
  description: "Descripción",
  images: ["https://images.test/house.jpg"],
  address: { street: "Calle", number: "42", zipCode: "1000" },
} as Property;
const category: MercadoLibreCategoryDto = {
  id: "MLA1",
  name: "Casas",
  path: [],
  children: [],
  listingAllowed: true,
  currencies: ["ARS", "USD"],
  listingTypes: [{ id: "gold", name: "Gold", remainingListings: null }],
  attributes: [
    {
      id: "AREA",
      name: "Superficie",
      valueType: "number_unit",
      required: true,
      readOnly: false,
      maxLength: 20,
      values: [],
      units: [{ id: "m²", name: "m²" }],
      defaultUnit: "m²",
    },
    {
      id: "TYPE",
      name: "Tipo",
      valueType: "list",
      required: true,
      readOnly: true,
      maxLength: 20,
      values: [{ id: "house", name: "Casa" }],
      units: [],
      defaultUnit: null,
    },
  ],
};
const form = (): ListingForm => ({
  ...initialListingForm(property, null),
  categoryId: category.id,
  listingType: "gold",
  price: "120000",
  contact: "Ana",
  areaCode: "11",
  phone: "12345678",
  phone2: "12345678",
  stateId: "STATE",
  cityId: "CITY",
  attributes: {
    ...attributeDefaults(category, null),
    AREA: { value: "80.5", unit: "m²" },
  },
});
const saved = (externalId: string | null = null) =>
  ({
    id: "listing",
    externalId,
    listingData: listingPayload(form(), category, null),
  }) as PortalListing;
it("builds a local draft with units, photo URLs and catalog IDs", () => {
  expect(listingPayload(form(), category, null)).toMatchObject({
    description: "Descripción",
    item: {
      title: "Casa",
      price: 120000,
      currency_id: "ARS",
      category_id: "MLA1",
      listing_type_id: "gold",
      pictures: [{ source: "https://images.test/house.jpg" }],
      location: { address_line: "Calle 42", city: { id: "CITY" } },
      attributes: [
        { id: "AREA", value_name: "80.5 m²" },
        { id: "TYPE", value_id: "house" },
      ],
    },
  });
});
it("restores stored units, category and location without guessing province IDs", () => {
  const listing = saved();
  const initial = initialListingForm(property, listing);
  expect(initial).toMatchObject({
    replaceLocation: false,
    stateId: "",
    cityId: "CITY",
    price: "120000",
  });
  expect(attributeDefaults(category, listing).AREA).toEqual({
    value: "80.5",
    unit: "m²",
  });
});
it("preserves immutable published fields even when form values or quotas change", () => {
  const listing = saved("MLA123");
  const changed = {
    ...form(),
    currency: "USD",
    listingType: "other",
    contact: "Other",
    cityId: "OTHER",
    address: "Other",
  };
  const result = record(
    listingPayload(
      changed,
      { ...category, listingAllowed: false, currencies: [], listingTypes: [] },
      listing,
    ).item,
  );
  const old = record(listing.listingData.item);
  for (const key of [
    "currency_id",
    "category_id",
    "listing_type_id",
    "seller_contact",
    "location",
  ])
    expect(result[key]).toEqual(old[key]);
});
it("preserves unknown and read-only attributes only within the same category", () => {
  const listing = saved();
  const item = record(listing.listingData.item);
  item.attributes = [
    ...(item.attributes as unknown[]),
    { id: "LEGACY", value_name: "keep" },
  ];
  const changed = form();
  changed.attributes.TYPE.value = "tampered";
  expect(
    record(listingPayload(changed, category, listing).item).attributes,
  ).toEqual(
    expect.arrayContaining([
      { id: "LEGACY", value_name: "keep" },
      { id: "TYPE", value_id: "house" },
    ]),
  );
  const next = { ...category, id: "MLA2" };
  expect(
    record(
      listingPayload({ ...form(), categoryId: "MLA2" }, next, listing).item,
    ).attributes,
  ).not.toEqual(expect.arrayContaining([{ id: "LEGACY", value_name: "keep" }]));
});
it("clears optional contact values and retains location unless explicitly replaced", () => {
  const listing = saved();
  record(record(listing.listingData.item).seller_contact).email =
    "old@example.test";
  const changed = {
    ...form(),
    replaceLocation: false,
    cityId: "OTHER",
    email: "",
  };
  const result = record(listingPayload(changed, category, listing).item);
  expect(record(result.seller_contact).email).toBeUndefined();
  expect(result.location).toEqual(record(listing.listingData.item).location);
});
it.each<Partial<ListingForm>>([
  { price: "0" },
  { price: "NaN" },
  { title: " " },
  { description: "" },
  { pictures: "http://images.test/a" },
  { pictures: "https://user:secret@images.test/a" },
  { pictures: "not-url" },
  { currency: "BRL" },
  { listingType: "unknown" },
  { stateId: "" },
  { cityId: "" },
  { contact: "" },
  { phone2: "" },
  { categoryId: "MLA2" },
  { attributes: { AREA: { value: "80", unit: "ft" } } },
  { attributes: { AREA: { value: "abc", unit: "m²" } } },
  { attributes: {} },
])("rejects invalid required fields before a request: %j", (override) => {
  expect(() =>
    listingPayload({ ...form(), ...override }, category, null),
  ).toThrow();
});
it("rejects unsupported enum values and length limits", () => {
  const enumCategory = {
    ...category,
    attributes: [{ ...category.attributes[1], readOnly: false, maxLength: 4 }],
  };
  expect(() =>
    listingPayload(
      { ...form(), attributes: { TYPE: { value: "other", unit: "" } } },
      enumCategory,
      null,
    ),
  ).toThrow();
});
it("normalizes absent or malformed optional stored data", () => {
  expect(record(null)).toEqual({});
  expect(record([])).toEqual({});
  expect(record("bad")).toEqual({});
  expect(
    attributeDefaults({ ...category, id: "MLA2" }, saved()).AREA.value,
  ).toBe("");
});
