import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MercadoLibreListingEditor } from "./MercadoLibreListingEditor";
import { portalsApi } from "@/lib/api/portals";
import { mercadoLibreApi } from "@/lib/api/mercadolibre";
import { propertiesApi } from "@/lib/api/properties";
import type {
  MercadoLibreCategoryDto,
  PortalListing,
  PortalOperationOverviewDto,
} from "@/generated/openapi";
import type { Property } from "@/types/property";
jest.mock("@/lib/api/portals", () => ({
  portalsApi: Object.fromEntries(
    [
      "list",
      "get",
      "operation",
      "category",
      "states",
      "cities",
      "neighborhoods",
      "create",
      "update",
      "publish",
      "pause",
      "close",
    ].map((key) => [key, jest.fn()]),
  ),
}));
jest.mock("@/lib/api/mercadolibre", () => ({
  mercadoLibreApi: { status: jest.fn() },
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getById: jest.fn() },
}));
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
const api = jest.mocked(portalsApi);
const category: MercadoLibreCategoryDto = {
  id: "MLA1",
  name: "Casas",
  path: [
    { id: "MLA1459", name: "Inmuebles" },
    { id: "MLA1", name: "Casas" },
  ],
  children: [],
  listingAllowed: true,
  currencies: ["ARS", "USD"],
  attributes: [],
  listingTypes: [{ id: "gold", name: "Gold", remainingListings: null }],
};
const property = {
  id: "property",
  name: "Casa",
  description: "Descripción",
  images: ["https://images.test/1"],
  address: { street: "Calle", number: "1", zipCode: "1000" },
} as Property;
const draft = {
  id: "listing",
  propertyId: "property",
  portal: "mercadolibre",
  externalId: null,
  providerStatus: null,
  listingData: {
    description: "Descripción",
    item: {
      title: "Casa",
      price: 100,
      currency_id: "ARS",
      category_id: "MLA1",
      listing_type_id: "gold",
      pictures: [{ source: "https://images.test/1" }],
      seller_contact: {
        contact: "Ana",
        area_code: "11",
        phone: "12345",
        country_code2: "54",
        phone2: "12345",
      },
      location: { address_line: "Calle 1", city: { id: "CITY" } },
      attributes: [],
    },
  },
} as unknown as PortalListing;
const overview = (status?: string): PortalOperationOverviewDto => ({
  enabled: true,
  job: status
    ? {
        id: "job",
        operation: "publish",
        status: status as NonNullable<
          PortalOperationOverviewDto["job"]
        >["status"],
        errorCode: null,
        attempts: 0,
        updatedAt: "2026-09-29",
      }
    : null,
});
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(propertiesApi.getById).mockResolvedValue(property);
  jest.mocked(mercadoLibreApi.status).mockResolvedValue({
    enabled: true,
    status: "active",
    sellerId: "42",
    expiresAt: null,
  });
  api.list.mockResolvedValue([draft]);
  api.get.mockResolvedValue(draft);
  api.operation.mockResolvedValue(overview());
  api.category.mockResolvedValue(category);
  api.states.mockResolvedValue([{ id: "STATE", name: "Provincia" }]);
  api.cities.mockResolvedValue([{ id: "CITY", name: "Ciudad" }]);
  api.neighborhoods.mockResolvedValue([{ id: "NEIGHBORHOOD", name: "Barrio" }]);
  api.update.mockResolvedValue(draft);
  api.create.mockResolvedValue(draft);
});
const mount = async () => {
  render(<MercadoLibreListingEditor propertyId="property" />);
  await screen.findByRole("button", { name: "saveDraft" });
};
const input = (name: string, value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: `fields.${name}` }), {
    target: { value },
  });
const confirm = async (action: string) => {
  fireEvent.click(screen.getByRole("button", { name: action }));
  expect(screen.getByRole("button", { name: "confirmAction" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "confirmAction" }));
  });
};
it.each([
  { enabled: false, status: "active", message: "disabled" },
  { enabled: true, status: "disconnected", message: "connectionRequired" },
])(
  "does not fetch catalog or offer writes when $message",
  async ({ enabled, status, message }) => {
    jest.mocked(mercadoLibreApi.status).mockResolvedValue({
      enabled,
      status,
      sellerId: null,
      expiresAt: null,
    } as never);
    render(<MercadoLibreListingEditor propertyId="property" />);
    await screen.findByText(message);
    expect(api.category).not.toHaveBeenCalled();
    expect(api.states).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "publish" }),
    ).not.toBeInTheDocument();
  },
);
it("saves edited drafts without publishing and reloads their stored metadata", async () => {
  await mount();
  input("title", "Casa actualizada");
  expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
  fireEvent.submit(
    screen.getByRole("button", { name: "saveDraft" }).closest("form")!,
  );
  await screen.findByText("saved");
  expect(api.update).toHaveBeenCalledWith(
    "listing",
    expect.objectContaining({
      item: expect.objectContaining({ title: "Casa actualizada" }),
    }),
  );
  expect(api.publish).not.toHaveBeenCalled();
  expect(api.get).toHaveBeenCalledWith("listing");
});
it("requires confirmation and shows queued rather than a completed publication", async () => {
  await mount();
  api.operation.mockResolvedValue(overview("queued"));
  await confirm("publish");
  await screen.findByText("operation.queued");
  expect(api.publish).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "saveDraft" })).toBeDisabled();
});
it("does not replay a lost response and requires reloading saved state", async () => {
  await mount();
  api.publish.mockRejectedValue(new Error("private provider response"));
  await confirm("publish");
  await screen.findByText("uncertain");
  expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
  expect(
    screen.queryByText("private provider response"),
  ).not.toBeInTheDocument();
  api.operation.mockResolvedValue(overview("needs_review"));
  fireEvent.click(screen.getByRole("button", { name: "reload" }));
  await screen.findByText("operation.needs_review");
  await screen.findByRole("button", { name: "saveDraft" });
  expect(api.publish).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "saveDraft" })).toBeDisabled();
});
it.each(["queued", "dispatching", "retry", "needs_review"])(
  "blocks changes during %s",
  async (status) => {
    api.operation.mockResolvedValue(overview(status));
    await mount();
    expect(
      screen.getByRole("textbox", { name: "fields.title" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
  },
);
it("creates a draft using selected category and location catalog entries", async () => {
  api.list.mockResolvedValue([]);
  api.category
    .mockResolvedValueOnce({
      ...category,
      id: "MLA1459",
      listingAllowed: false,
      children: [{ id: "MLA1", name: "Casas" }],
    })
    .mockResolvedValue(category);
  render(<MercadoLibreListingEditor propertyId="property" />);
  fireEvent.change(
    await screen.findByRole("combobox", { name: /subcategory/ }),
    { target: { value: "MLA1" } },
  );
  await screen.findByRole("button", { name: "saveDraft" });
  fireEvent.change(screen.getByRole("spinbutton", { name: "fields.price" }), {
    target: { value: "100" },
  });
  fireEvent.change(
    screen.getByRole("combobox", { name: /fields.listingType/ }),
    { target: { value: "gold" } },
  );
  for (const [key, value] of Object.entries({
    contact: "Ana",
    areaCode: "11",
    phone: "12345",
    phone2: "12345",
  }))
    input(key, value);
  fireEvent.change(screen.getByRole("combobox", { name: /fields.stateId/ }), {
    target: { value: "STATE" },
  });
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "Ciudad" })).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByRole("combobox", { name: /fields.cityId/ }), {
    target: { value: "CITY" },
  });
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "Barrio" })).toBeInTheDocument(),
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "saveDraft" }).closest("form")!,
  );
  await screen.findByText("saved");
  expect(api.create).toHaveBeenCalledWith(
    "property",
    expect.objectContaining({
      item: expect.objectContaining({
        category_id: "MLA1",
        location: expect.objectContaining({ city: { id: "CITY" } }),
      }),
    }),
  );
  expect(api.publish).not.toHaveBeenCalled();
});
it("blocks after a failed catalog read and recovers by reloading", async () => {
  api.category.mockRejectedValueOnce(new Error("offline"));
  render(<MercadoLibreListingEditor propertyId="property" />);
  await screen.findByText("uncertain");
  expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "reload" }));
  await screen.findByRole("button", { name: "saveDraft" });
});
it.each(["pause", "close"])(
  "queues %s only after confirmation, including an empty DELETE response",
  async (action) => {
    const published = {
      ...draft,
      externalId: "MLA123",
      providerStatus: "active",
    };
    api.list.mockResolvedValue([published]);
    api.get.mockResolvedValue(published);
    api.close.mockResolvedValue(undefined);
    render(<MercadoLibreListingEditor propertyId="property" />);
    await screen.findByRole("button", { name: "saveUpdate" });
    expect(
      screen.getByRole("textbox", { name: "fields.contact" }),
    ).toBeDisabled();
    api.operation.mockResolvedValue(overview("queued"));
    await confirm(action);
    await screen.findByText("operation.queued");
    expect(action === "close" ? api.close : api.pause).toHaveBeenCalledWith(
      "listing",
    );
  },
);
it("does not reactivate closed listings", async () => {
  api.list.mockResolvedValue([
    { ...draft, externalId: "MLA123", providerStatus: "closed" },
  ]);
  render(<MercadoLibreListingEditor propertyId="property" />);
  await screen.findByText("closed");
  await screen.findByRole("button", { name: "saveUpdate" });
  expect(screen.getByRole("button", { name: "saveUpdate" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "resume" }),
  ).not.toBeInTheDocument();
});
it("validates before requesting a save", async () => {
  await mount();
  input("pictures", "http://images.test/1");
  fireEvent.submit(
    screen.getByRole("button", { name: "saveDraft" }).closest("form")!,
  );
  await screen.findByText("invalid");
  expect(api.update).not.toHaveBeenCalled();
});
it("recovers load failures without provider calls", async () => {
  jest.mocked(propertiesApi.getById).mockResolvedValueOnce(null);
  render(<MercadoLibreListingEditor propertyId="property" />);
  await screen.findByText("loadError");
  expect(api.category).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "reload" }));
  await screen.findByRole("button", { name: "saveDraft" });
});
it("ignores a catalog completion after unmount", async () => {
  let complete!: (value: MercadoLibreCategoryDto) => void;
  api.category.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const view = render(<MercadoLibreListingEditor propertyId="property" />);
  await waitFor(() => expect(api.category).toHaveBeenCalled());
  view.unmount();
  await act(async () => complete(category));
  expect(api.create).not.toHaveBeenCalled();
});
it("submits typed attributes with units and preserves fixed catalog values", async () => {
  api.category.mockResolvedValue({
    ...category,
    attributes: [
      {
        id: "AREA",
        name: "Superficie",
        valueType: "number_unit",
        required: true,
        readOnly: false,
        maxLength: 20,
        values: [],
        units: [
          { id: "m²", name: "m²" },
          { id: "ha", name: "ha" },
        ],
        defaultUnit: "m²",
      },
      {
        id: "ROOMS",
        name: "Ambientes",
        valueType: "list",
        required: true,
        readOnly: false,
        maxLength: 20,
        values: [{ id: "2", name: "Dos" }],
        units: [],
        defaultUnit: null,
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
  });
  await mount();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Superficie *" }), {
    target: { value: "2.5" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /^unit/ }), {
    target: { value: "ha" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /Ambientes/ }), {
    target: { value: "2" },
  });
  expect(screen.getByRole("combobox", { name: /^Tipo/ })).toBeDisabled();
  fireEvent.submit(
    screen.getByRole("button", { name: "saveDraft" }).closest("form")!,
  );
  await screen.findByText("saved");
  expect(api.update).toHaveBeenCalledWith(
    "listing",
    expect.objectContaining({
      item: expect.objectContaining({
        attributes: [
          { id: "AREA", value_name: "2.5 ha" },
          { id: "ROOMS", value_id: "2" },
          { id: "TYPE", value_id: "house" },
        ],
      }),
    }),
  );
});
it("blocks writes after a failed location lookup", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "changeLocation" }));
  api.cities.mockRejectedValue(new Error("offline"));
  fireEvent.change(screen.getByRole("combobox", { name: /fields.stateId/ }), {
    target: { value: "STATE" },
  });
  await screen.findByText("uncertain");
  expect(screen.getByRole("button", { name: "saveDraft" })).toBeDisabled();
  expect(api.update).not.toHaveBeenCalled();
});
it("prevents duplicate submission while the first request remains pending", async () => {
  api.update.mockReturnValue(new Promise(() => {}));
  await mount();
  const form = screen
    .getByRole("button", { name: "saveDraft" })
    .closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "saveDraft" })).toBeDisabled();
});
