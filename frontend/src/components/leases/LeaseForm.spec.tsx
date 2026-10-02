import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LeaseForm } from "./LeaseForm";
import { Lease } from "@/types/lease";

const mockRouter = { push: jest.fn(), refresh: jest.fn(), back: jest.fn() };
const mockLeases = {
  create: jest.fn(),
  update: jest.fn(),
  getAll: jest.fn(),
  getTemplates: jest.fn(),
};
const mockProperties = { getAll: jest.fn(), getById: jest.fn() };
const mockOwners = { getAll: jest.fn(), getById: jest.fn() };
const mockInterested = {
  getAll: jest.fn(),
  create: jest.fn(),
  convertToTenant: jest.fn(),
  convertToBuyer: jest.fn(),
};
const mockBuyers = { getAll: jest.fn() };
const mockTenants = { getAll: jest.fn() };
const mockCurrencies = { getAll: jest.fn(), getDefaultForLocale: jest.fn() };
let mockParams = new URLSearchParams();
const mockTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({ useSearchParams: () => mockParams }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => mockRouter,
}));
jest.mock("@/lib/api/leases", () => ({
  leasesApi: {
    create: (...args: unknown[]) => mockLeases.create(...args),
    update: (...args: unknown[]) => mockLeases.update(...args),
    getAll: (...args: unknown[]) => mockLeases.getAll(...args),
    getTemplates: (...args: unknown[]) => mockLeases.getTemplates(...args),
  },
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: {
    getAll: (...args: unknown[]) => mockProperties.getAll(...args),
    getById: (...args: unknown[]) => mockProperties.getById(...args),
  },
}));
jest.mock("@/lib/api/owners", () => ({
  ownersApi: {
    getAll: (...args: unknown[]) => mockOwners.getAll(...args),
    getById: (...args: unknown[]) => mockOwners.getById(...args),
  },
}));
jest.mock("@/lib/api/interested", () => ({
  interestedApi: {
    getAll: (...args: unknown[]) => mockInterested.getAll(...args),
    create: (...args: unknown[]) => mockInterested.create(...args),
    convertToTenant: (...args: unknown[]) =>
      mockInterested.convertToTenant(...args),
    convertToBuyer: (...args: unknown[]) =>
      mockInterested.convertToBuyer(...args),
  },
}));
jest.mock("@/lib/api/buyers", () => ({
  buyersApi: { getAll: (...args: unknown[]) => mockBuyers.getAll(...args) },
}));
jest.mock("@/lib/api/tenants", () => ({
  tenantsApi: { getAll: (...args: unknown[]) => mockTenants.getAll(...args) },
}));
jest.mock("@/lib/api/currencies", () => ({
  currenciesApi: {
    getAll: (...args: unknown[]) => mockCurrencies.getAll(...args),
    getDefaultForLocale: (...args: unknown[]) =>
      mockCurrencies.getDefaultForLocale(...args),
  },
}));

describe("LeaseForm", () => {
  const address = {
    street: "Calle",
    number: "10",
    city: "Ciudad",
    state: "Provincia",
    zipCode: "1000",
    country: "Argentina",
  };
  const property = {
    id: "property",
    name: "Rent home",
    ownerId: "owner",
    operations: ["rent"],
    address,
  };
  const saleProperty = {
    ...property,
    id: "sale-property",
    name: "Sale home",
    operations: ["sale"],
  };
  const bothProperty = {
    ...property,
    id: "both-property",
    name: "Flexible home",
    operations: ["rent", "sale"],
  };
  const owner = {
    id: "owner",
    firstName: "Ada",
    lastName: "Owner",
    email: "owner@example.invalid",
    phone: "5411111111",
  };
  const buyer = {
    id: "buyer",
    firstName: "Beto",
    lastName: "Buyer",
    interestedProfileId: "buyer-profile",
    email: "buyer@example.invalid",
    phone: "5411222222",
  };
  const tenantProfile = {
    id: "tenant-profile",
    firstName: "Ana",
    lastName: "Tenant",
    convertedToTenantId: "tenant",
    operations: ["rent"],
    email: "ana@example.invalid",
    phone: "5411333333",
  };
  const profiles = [
    tenantProfile,
    { ...tenantProfile, id: "duplicate" },
    {
      id: "rent-interest",
      operation: "rent",
      phone: "5411444444",
      email: "interested@example.invalid",
    },
    {
      id: "sale-interest",
      operations: ["sale"],
      firstName: "Sonia",
      lastName: "Interested",
      phone: "5411555555",
    },
    {
      id: "converted-buyer",
      operations: ["sale"],
      convertedToBuyerId: "other-buyer",
      phone: "5411666666",
    },
    {
      id: "known-buyer",
      operations: ["sale"],
      convertedToBuyerId: "buyer",
      phone: "5411777777",
    },
    { id: "unclassified", phone: "5411888888" },
  ];
  const initial: Lease = {
    id: "lease",
    propertyId: "property",
    tenantId: "tenant",
    ownerId: "owner",
    contractType: "rental",
    startDate: "2026-09-01",
    endDate: "2027-09-01",
    rentAmount: 1000,
    depositAmount: 100,
    currency: "ARS",
    status: "DRAFT",
    documents: [],
    terms: "Texto propio",
    billingDay: 1,
    paymentDueDay: 10,
    adjustmentFrequencyMonths: 12,
    paymentFrequency: "monthly",
    billingFrequency: "first_of_month",
    adjustmentType: "fixed",
    lateFeeType: "none",
    renewalAlertEnabled: true,
    renewalAlertPeriodicity: "monthly",
    autoGenerateInvoices: true,
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  };
  let alert: jest.SpyInstance;
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = new URLSearchParams();
    mockProperties.getAll.mockResolvedValue([
      property,
      saleProperty,
      bothProperty,
    ]);
    mockProperties.getById.mockResolvedValue(null);
    mockOwners.getAll.mockResolvedValue([owner]);
    mockOwners.getById.mockResolvedValue(null);
    mockInterested.getAll.mockResolvedValue({
      data: profiles,
      total: profiles.length,
      page: 1,
      limit: 100,
    });
    mockBuyers.getAll.mockResolvedValue([buyer]);
    mockTenants.getAll.mockResolvedValue([]);
    mockLeases.getAll.mockResolvedValue([]);
    mockLeases.getTemplates.mockResolvedValue([]);
    mockLeases.create.mockResolvedValue({ id: "created" });
    mockLeases.update.mockResolvedValue({ id: "lease" });
    mockInterested.convertToTenant.mockResolvedValue({
      tenant: { id: "converted-tenant" },
    });
    mockInterested.convertToBuyer.mockResolvedValue({
      buyer: { ...buyer, id: "converted-buyer" },
    });
    mockInterested.create.mockResolvedValue({
      id: "quick-profile",
      firstName: "Nueva",
      lastName: "Persona",
      phone: "123456",
      operations: ["rent"],
    });
    mockCurrencies.getAll.mockResolvedValue([
      { code: "ARS", symbol: "$" },
      { code: "USD", symbol: "US$" },
    ]);
    mockCurrencies.getDefaultForLocale.mockResolvedValue({ code: "ARS" });
    alert = jest.spyOn(window, "alert").mockImplementation(() => undefined);
    consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    alert.mockRestore();
    consoleError.mockRestore();
  });
  function change(id: string, value: string) {
    const element = document.getElementById(id);
    expect(element).not.toBeNull();
    fireEvent.change(element!, { target: { value } });
  }
  async function loaded() {
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Ana Tenant" }),
      ).toBeInTheDocument(),
    );
  }
  function submit(container: HTMLElement) {
    fireEvent.submit(container.querySelector("form")!);
  }

  it("creates a rental using the selected tenant and the property owner", async () => {
    const { container } = render(<LeaseForm initialData={initial} />);
    await loaded();
    submit(container);
    await waitFor(() =>
      expect(mockLeases.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contractType: "rental",
          tenantId: "tenant",
          buyerId: undefined,
          ownerId: "owner",
          rentAmount: 1000,
          terms: "Texto propio",
        }),
      ),
    );
    expect(mockInterested.convertToTenant).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/leases/created");
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("selects an independent tenant and sends the canonical entity identifier", async () => {
    mockTenants.getAll.mockResolvedValue([
      {
        id: "tenant-user",
        tenantEntityId: "tenant-entity",
        firstName: "Independiente",
        lastName: "Persona",
        email: "person@example.invalid",
      },
    ]);
    const { container } = render(<LeaseForm initialData={initial} />);
    await loaded();
    change("tenantId", "tenant-user");
    submit(container);
    await waitFor(() =>
      expect(mockLeases.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-entity" }),
      ),
    );
    expect(mockInterested.convertToTenant).not.toHaveBeenCalled();
    expect(mockTenants.getAll).toHaveBeenCalledTimes(1);
  });

  it("displays the canonical tenant party when editing a contract created from an independent person", async () => {
    mockTenants.getAll.mockResolvedValue([
      {
        id: "tenant-user",
        tenantEntityId: "tenant-entity",
        firstName: "Independiente",
        lastName: "Persona",
      },
    ]);
    render(
      <LeaseForm
        initialData={{ ...initial, tenantId: "tenant-entity" }}
        isEditing
      />,
    );
    await screen.findByRole("option", { name: "Independiente Persona" });
    expect(screen.getByLabelText("fields.tenant")).toHaveValue("tenant-user");
  });

  it("does not duplicate a tenant linked to an interested profile", async () => {
    mockTenants.getAll.mockResolvedValue([
      {
        id: "tenant-user",
        tenantEntityId: "tenant",
        firstName: "Ana",
        lastName: "Tenant",
      },
    ]);
    render(<LeaseForm initialData={initial} />);
    await loaded();
    expect(screen.getAllByRole("option", { name: "Ana Tenant" })).toHaveLength(
      1,
    );
  });

  it("includes interested people from later pages in the party selector", async () => {
    mockInterested.getAll.mockImplementation(async ({ page }) => ({
      data:
        page === 1
          ? [tenantProfile]
          : [
              {
                id: "later-profile",
                operation: "rent",
                phone: "123456",
                firstName: "Segunda",
                lastName: "Página",
              },
            ],
      total: 2,
      page,
      limit: 1,
    }));
    render(<LeaseForm initialData={initial} />);
    await screen.findByRole("option", { name: "Segunda Página · interesado" });
    expect(mockInterested.getAll).toHaveBeenNthCalledWith(1, {
      page: 1,
      limit: 100,
    });
    expect(mockInterested.getAll).toHaveBeenNthCalledWith(2, {
      page: 2,
      limit: 100,
    });
  });

  it("recovers a failed initial read only after the user retries", async () => {
    mockProperties.getAll
      .mockRejectedValueOnce(new Error("read unavailable"))
      .mockResolvedValue([property]);
    render(<LeaseForm initialData={initial} />);
    const retry = await screen.findByRole("button", { name: "retry" });
    expect(mockProperties.getAll).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await loaded();
    expect(mockProperties.getAll).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "retry" })).toBeNull();
  });

  it("updates an existing lease through the update endpoint", async () => {
    const { container } = render(<LeaseForm initialData={initial} isEditing />);
    await loaded();
    change("rentAmount", "1500");
    submit(container);
    await waitFor(() =>
      expect(mockLeases.update).toHaveBeenCalledWith(
        "lease",
        expect.objectContaining({ rentAmount: 1500 }),
      ),
    );
    expect(mockLeases.create).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith("/leases/lease");
  });

  it("converts a rental prospect once and persists the resulting tenant identifier", async () => {
    const { container } = render(<LeaseForm initialData={initial} />);
    await loaded();
    change("tenantId", "interested:rent-interest");
    expect(screen.getByText(/convertira automaticamente/)).toBeInTheDocument();
    submit(container);
    await waitFor(() =>
      expect(mockLeases.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "converted-tenant" }),
      ),
    );
    expect(mockInterested.convertToTenant).toHaveBeenCalledWith(
      "rent-interest",
      { email: "interested@example.invalid" },
    );
  });

  it("creates a sale with the selected buyer and no rental party", async () => {
    const { container } = render(
      <LeaseForm
        initialData={{
          ...initial,
          propertyId: "sale-property",
          contractType: "sale",
          buyerId: "buyer",
          tenantId: undefined,
          fiscalValue: 250000,
        }}
      />,
    );
    await screen.findByRole("option", { name: "Beto Buyer" });
    submit(container);
    await waitFor(() =>
      expect(mockLeases.create).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyId: "sale-property",
          contractType: "sale",
          buyerId: "buyer",
          tenantId: undefined,
          fiscalValue: 250000,
        }),
      ),
    );
    expect(mockInterested.convertToBuyer).not.toHaveBeenCalled();
  });

  it("converts a sale prospect and selects the converted buyer in the form", async () => {
    const { container } = render(
      <LeaseForm
        initialData={{
          ...initial,
          propertyId: "sale-property",
          contractType: "sale",
          buyerId: "interested-buyer:sale-interest",
          tenantId: undefined,
          fiscalValue: 250000,
        }}
      />,
    );
    await screen.findByRole("option", {
      name: "Sonia Interested · interesado",
    });
    submit(container);
    await waitFor(() =>
      expect(mockLeases.create).toHaveBeenCalledWith(
        expect.objectContaining({ buyerId: "converted-buyer" }),
      ),
    );
    expect(mockInterested.convertToBuyer).toHaveBeenCalledWith(
      "sale-interest",
      { email: undefined },
    );
  });

  it("allows choosing rental or sale only when the property supports both", async () => {
    render(
      <LeaseForm initialData={{ ...initial, propertyId: "both-property" }} />,
    );
    await loaded();
    expect(screen.getByLabelText("fields.contractType")).toHaveValue("rental");
    change("contractType", "sale");
    await screen.findByRole("option", { name: "Beto Buyer" });
    expect(screen.queryByLabelText("fields.tenant")).toBeNull();
    expect(screen.getByLabelText("fields.buyer")).toBeInTheDocument();
  });

  it("opens the latest matching contract rather than creating a duplicate", async () => {
    mockLeases.getAll.mockResolvedValue([
      { ...initial, id: "old", updatedAt: "2026-01-01" },
      { ...initial, id: "latest", updatedAt: "2026-10-01" },
      { ...initial, id: "closed", status: "FINALIZED" },
      { ...initial, id: "unrelated", propertyId: "other" },
    ]);
    const { container } = render(<LeaseForm initialData={initial} />);
    await loaded();
    expect(screen.getByText(/Ya existe un contrato/)).toBeInTheDocument();
    submit(container);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith("/leases/latest"),
    );
    expect(mockLeases.create).not.toHaveBeenCalled();
  });

  it("also prevents duplicate sale agreements for the same buyer and property", async () => {
    const sale = {
      ...initial,
      propertyId: "sale-property",
      contractType: "sale" as const,
      buyerId: "buyer",
      tenantId: undefined,
      fiscalValue: 100,
    };
    mockLeases.getAll.mockResolvedValue([sale]);
    const { container } = render(<LeaseForm initialData={sale} />);
    await screen.findByRole("option", { name: "Beto Buyer" });
    submit(container);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith("/leases/lease"),
    );
    expect(mockLeases.create).not.toHaveBeenCalled();
  });

  it("loads missing preselected property and owner, then locks the rental context", async () => {
    mockParams = new URLSearchParams(
      "propertyId=remote&tenantId=tenant&propertyName=Remote&ownerName=Owner&propertyOperations=rent,unknown",
    );
    mockProperties.getById.mockResolvedValue({
      ...property,
      id: "remote",
      name: "Remote home",
      ownerId: "remote-owner",
    });
    mockOwners.getById.mockResolvedValue({ ...owner, id: "remote-owner" });
    const { container } = render(
      <LeaseForm initialData={{ ...initial, propertyId: "remote" }} />,
    );
    await screen.findByText("Remote home");
    expect(mockProperties.getById).toHaveBeenCalledWith("remote");
    expect(mockOwners.getById).toHaveBeenCalledWith("remote-owner");
    expect(container.querySelector("select#propertyId")).toBeNull();
    expect(container.querySelector("select#tenantId")).toBeNull();
    submit(container);
    await waitFor(() =>
      expect(mockLeases.create).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyId: "remote",
          tenantId: "tenant",
          ownerId: "remote-owner",
        }),
      ),
    );
  });

  it("blocks creation for an unavailable preselected property", async () => {
    mockParams = new URLSearchParams(
      "propertyId=missing&tenantId=tenant&propertyOperations=rent",
    );
    const { container } = render(
      <LeaseForm initialData={{ ...initial, propertyId: "missing" }} />,
    );
    await waitFor(() =>
      expect(mockProperties.getById).toHaveBeenCalledWith("missing"),
    );
    submit(container);
    await waitFor(() => expect(alert).toHaveBeenCalledWith("unknownProperty"));
    expect(mockLeases.create).not.toHaveBeenCalled();
  });

  it("locks a buyer prospect from the query and converts it on save", async () => {
    mockParams = new URLSearchParams(
      "propertyId=sale-property&buyerProfileId=sale-interest",
    );
    const { container } = render(
      <LeaseForm
        initialData={{
          ...initial,
          propertyId: "sale-property",
          contractType: "sale",
          fiscalValue: 100,
        }}
      />,
    );
    await screen.findByText("Sonia Interested · interesado");
    submit(container);
    await waitFor(() =>
      expect(mockInterested.convertToBuyer).toHaveBeenCalledWith(
        "sale-interest",
        { email: undefined },
      ),
    );
  });

  it("locks a rental prospect from the query and filters sale-only property choices", async () => {
    mockParams = new URLSearchParams("interestedProfileId=rent-interest");
    render(<LeaseForm initialData={initial} />);
    await screen.findByRole("option", { name: "Rent home" });
    expect(screen.queryByRole("option", { name: "Sale home" })).toBeNull();
    expect(screen.getByText("5411444444 · interesado")).toBeInTheDocument();
  });

  it("renders one template using typed values while omitting incomplete paragraphs", async () => {
    mockLeases.getTemplates.mockResolvedValue([
      {
        id: "template",
        name: "Rental template",
        contractType: "rental",
        templateBody:
          "Hola {{tenant.firstName}} en {property.name}.\n\nMonto {{lease.monthlyRent}} / automático {{lease.autoGenerateInvoices}}.\n\nFalta {{owner.unavailable}}.\n\nObjeto {{property}}.\n\nDato {{lease.startDate.day}}.",
      },
    ]);
    const { container } = render(<LeaseForm initialData={initial} />);
    await loaded();
    await waitFor(() =>
      expect(screen.getByLabelText("termsAndConditions")).toHaveValue(
        "Hola Ana en Rent home.\n\nMonto 1000 / automático true.",
      ),
    );
    expect(screen.getByLabelText("termsAndConditions")).toHaveAttribute(
      "readonly",
    );
    submit(container);
    await waitFor(() =>
      expect(mockLeases.create).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: "template",
          terms: "Hola Ana en Rent home.\n\nMonto 1000 / automático true.",
        }),
      ),
    );
  });

  it("keeps a selected template from a list and permits changing the template", async () => {
    mockLeases.getTemplates.mockResolvedValue([
      {
        id: "first",
        name: "First",
        contractType: "rental",
        templateBody: "Texto uno",
      },
      {
        id: "second",
        name: "Second",
        contractType: "rental",
        templateBody: "Texto dos",
      },
    ]);
    render(
      <LeaseForm
        initialData={{ ...initial, templateId: "second" }}
        isEditing
      />,
    );
    await loaded();
    expect(screen.getByLabelText("fields.template")).toHaveValue("second");
    change("templateId", "first");
    await waitFor(() =>
      expect(screen.getByLabelText("termsAndConditions")).toHaveValue(
        "Texto uno",
      ),
    );
  });

  it("shows late-fee, inflation lag and custom renewal fields only when selected", async () => {
    render(<LeaseForm initialData={initial} />);
    await loaded();
    expect(screen.queryByLabelText("fields.lateFeeValue")).toBeNull();
    change("lateFeeType", "daily_percentage");
    expect(screen.getByLabelText("fields.lateFeeValue")).toBeInTheDocument();
    change("adjustmentType", "percentage");
    expect(
      screen.getByLabelText("fields.adjustmentValue (%)"),
    ).toBeInTheDocument();
    change("adjustmentType", "inflation_index");
    change("inflationIndexType", "ipc");
    expect(screen.getByLabelText(/Rezago|lag|Lag/)).toBeInTheDocument();
    change("renewalAlertPeriodicity", "custom");
    expect(
      screen.getByLabelText("Dias previos para alertar"),
    ).toBeInTheDocument();
  });

  it("validates rental party and dates before calling create", async () => {
    const { container } = render(<LeaseForm />);
    await loaded();
    submit(container);
    await screen.findByText("tenantRequired");
    expect(screen.getByText("startDateRequired")).toBeInTheDocument();
    expect(mockLeases.create).not.toHaveBeenCalled();
  });

  async function openQuick() {
    fireEvent.click(screen.getByRole("button", { name: "Crear interesado" }));
  }
  function fillQuick() {
    change("quickInterestedFirstName", " Nueva ");
    change("quickInterestedLastName", " Persona ");
    change("quickInterestedPhone", " 123456 ");
  }

  it("validates the quick prospect fields before creating a person", async () => {
    render(<LeaseForm initialData={initial} />);
    await loaded();
    await openQuick();
    fireEvent.click(
      screen.getByRole("button", { name: "Crear y seleccionar" }),
    );
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("obligatorios"));
    expect(mockInterested.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar formulario" }));
    expect(screen.queryByLabelText("Nombre")).toBeNull();
  });

  it.each(["rental", "sale"] as const)(
    "creates and selects a trimmed %s prospect without a second search",
    async (contractType) => {
      const isSale = contractType === "sale";
      mockInterested.create.mockResolvedValue({
        id: "quick-profile",
        firstName: "Nueva",
        lastName: "Persona",
        phone: "123456",
        operations: [isSale ? "sale" : "rent"],
      });
      render(
        <LeaseForm
          initialData={{
            ...initial,
            contractType,
            propertyId: isSale ? "sale-property" : "property",
            fiscalValue: isSale ? 100 : undefined,
          }}
        />,
      );
      await waitFor(() => expect(mockInterested.getAll).toHaveBeenCalled());
      await openQuick();
      fillQuick();
      change("quickInterestedEmail", "nueva@example.invalid");
      fireEvent.click(
        screen.getByRole("button", { name: "Crear y seleccionar" }),
      );
      await waitFor(() =>
        expect(mockInterested.create).toHaveBeenCalledWith({
          firstName: "Nueva",
          lastName: "Persona",
          phone: "123456",
          email: "nueva@example.invalid",
          operation: isSale ? "sale" : "rent",
          operations: [isSale ? "sale" : "rent"],
          status: "interested",
        }),
      );
      await screen.findByRole("option", { name: "Nueva Persona · interesado" });
      await waitFor(() =>
        expect(
          screen.getByLabelText(isSale ? "fields.buyer" : "fields.tenant"),
        ).toHaveValue(
          `${isSale ? "interested-buyer" : "interested"}:quick-profile`,
        ),
      );
      expect(screen.queryByLabelText("Nombre")).toBeNull();
    },
  );

  it("reports a quick-create failure and retains the entered fields for retry", async () => {
    mockInterested.create.mockRejectedValue(new Error("create unavailable"));
    render(<LeaseForm initialData={initial} />);
    await loaded();
    await openQuick();
    fillQuick();
    fireEvent.click(
      screen.getByRole("button", { name: "Crear y seleccionar" }),
    );
    await waitFor(() => expect(alert).toHaveBeenCalledWith("error"));
    expect(screen.getByLabelText("Nombre")).toHaveValue(" Nueva ");
    expect(
      screen.getByRole("button", { name: "Crear y seleccionar" }),
    ).toBeEnabled();
  });

  it("reports a save failure and allows retry without leaving the form", async () => {
    mockLeases.create.mockRejectedValue(new Error("save unavailable"));
    const { container } = render(<LeaseForm initialData={initial} />);
    await loaded();
    submit(container);
    await waitFor(() => expect(alert).toHaveBeenCalledWith("error"));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "saveLease" })).toBeEnabled();
  });

  it("reports failed initial reads and lets the user cancel", async () => {
    mockProperties.getAll.mockRejectedValue(new Error("read unavailable"));
    render(<LeaseForm />);
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to load form data",
        expect.any(Error),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("loads form collections once even when the buyer API returns fresh arrays", async () => {
    mockBuyers.getAll.mockImplementation(async () => [{ ...buyer }]);
    render(<LeaseForm initialData={initial} />);
    await loaded();
    await act(async () => undefined);
    expect(mockProperties.getAll).toHaveBeenCalledTimes(1);
    expect(mockBuyers.getAll).toHaveBeenCalledTimes(1);
  });
});
