import messages from "../../../../../messages/es.json";
const mockImportMessages: Record<string, string> = messages.leaseImport;
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "./page";
import { propertiesApi } from "@/lib/api/properties";
import { ownersApi } from "@/lib/api/owners";
import { interestedApi } from "@/lib/api/interested";
import { buyersApi } from "@/lib/api/buyers";
import { tenantsApi } from "@/lib/api/tenants";
import { leasesApi } from "@/lib/api/leases";
import { submitLeaseImport } from "@/lib/lease-import-recovery";
const mockPush = jest.fn(),
  mockRefresh = jest.fn();
let mockAuthLoading = false;
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => mockImportMessages[key],
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    loading: mockAuthLoading,
    user: { id: "admin", companyId: "company", role: "admin" },
  }),
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));
jest.mock("@/components/common/CurrencySelect", () => ({
  CurrencySelect: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label="Moneda"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option>ARS</option>
      <option>USD</option>
    </select>
  ),
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getAll: jest.fn() },
}));
jest.mock("@/lib/api/owners", () => ({ ownersApi: { getAll: jest.fn() } }));
jest.mock("@/lib/api/tenants", () => ({ tenantsApi: { getAll: jest.fn() } }));
jest.mock("@/lib/api/buyers", () => ({ buyersApi: { getAll: jest.fn() } }));
jest.mock("@/lib/api/leases", () => ({
  leasesApi: { getAll: jest.fn(), importCurrentContract: jest.fn() },
}));
jest.mock("@/lib/api/interested", () => ({
  interestedApi: {
    getAll: jest.fn(),
    create: jest.fn(),
    convertToTenant: jest.fn(),
    convertToBuyer: jest.fn(),
  },
}));
jest.mock("@/lib/lease-import-recovery", () => ({
  submitLeaseImport: jest.fn(),
}));
const profile = {
  id: "prospect",
  firstName: "Ana",
  lastName: "Prospect",
  phone: "123456",
  operations: ["rent", "sale"],
};
const converted = {
  ...profile,
  id: "converted",
  firstName: "Persona",
  convertedToTenantId: "tenant-canonical",
  convertedToBuyerId: "buyer-canonical",
};
const property = {
  id: "property",
  name: "Casa",
  ownerId: "owner",
  operations: ["rent", "sale"],
};
beforeEach(() => {
  jest.clearAllMocks();
  mockAuthLoading = false;
  jest.mocked(propertiesApi.getAll).mockResolvedValue([property] as never);
  jest
    .mocked(ownersApi.getAll)
    .mockResolvedValue([
      { id: "owner", firstName: "Owner", lastName: "Local" },
    ] as never);
  jest.mocked(tenantsApi.getAll).mockResolvedValue([
    {
      id: "user",
      tenantEntityId: "tenant-canonical",
      firstName: "Persona",
      lastName: "Tenant",
    },
  ] as never);
  jest
    .mocked(buyersApi.getAll)
    .mockResolvedValue([
      { id: "buyer", firstName: "Maria", lastName: "Buyer" },
    ] as never);
  jest.mocked(interestedApi.getAll).mockResolvedValue({
    data: [profile, converted],
    page: 1,
    limit: 100,
    total: 2,
  } as never);
  jest.mocked(leasesApi.getAll).mockResolvedValue([]);
  jest.mocked(submitLeaseImport).mockResolvedValue({ id: "imported" } as never);
  jest
    .mocked(interestedApi.convertToTenant)
    .mockResolvedValue({ tenant: { id: "converted-tenant" } } as never);
  jest.mocked(interestedApi.convertToBuyer).mockResolvedValue({
    buyer: { id: "converted-buyer", firstName: "Ana" },
  } as never);
  jest.spyOn(window, "alert").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const select = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const mount = async () => {
  const view = render(<Page />);
  await screen.findByLabelText("Tipo de contrato");
  return view;
};
const prepare = (container: HTMLElement, party = "tenant-canonical") => {
  select("Propiedad", "property");
  select(
    screen.queryByLabelText("Comprador / interesado")
      ? "Comprador / interesado"
      : "Locatario / interesado",
    party,
  );
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: {
      files: [new File(["pdf"], "contrato.pdf", { type: "application/pdf" })],
    },
  });
};
const submit = (container: HTMLElement) =>
  fireEvent.submit(container.querySelector("form")!);
it("uses independent canonical tenant IDs, deduplicates converted people and imports the selected contract", async () => {
  const { container } = await mount();
  expect(
    screen
      .getByLabelText("Locatario / interesado")
      .querySelectorAll('option[value="tenant-canonical"]'),
  ).toHaveLength(1);
  prepare(container);
  select("Inicio", "2026-10-01");
  select("Fin", "2027-10-01");
  select("Canon actual", "123456.78");
  select("Deposito", "200");
  select("Moneda", "USD");
  select("Observaciones", " Revisado ");
  submit(container);
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith("/leases/imported"),
  );
  expect(submitLeaseImport).toHaveBeenCalledWith(
    "company",
    "admin",
    expect.objectContaining({
      tenantId: "tenant-canonical",
      propertyId: "property",
      ownerId: "owner",
      rentAmount: 123456.78,
      depositAmount: 200,
      notes: "Revisado",
      currency: "USD",
    }),
    leasesApi.importCurrentContract,
  );
  expect(interestedApi.convertToTenant).not.toHaveBeenCalled();
});
it.each(["rental", "sale"])(
  "converts a prospect once before a %s import and retains the new identity after a lost response",
  async (type) => {
    const { container } = await mount();
    select("Tipo de contrato", type);
    prepare(
      container,
      type === "sale" ? "interested-buyer:prospect" : "interested:prospect",
    );
    if (type === "sale") select("Valor del acuerdo", "90000");
    jest.mocked(submitLeaseImport).mockRejectedValueOnce(new Error("lost"));
    submit(container);
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    submit(container);
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(
      type === "sale"
        ? interestedApi.convertToBuyer
        : interestedApi.convertToTenant,
    ).toHaveBeenCalledTimes(1);
    expect(submitLeaseImport).toHaveBeenLastCalledWith(
      "company",
      "admin",
      expect.objectContaining(
        type === "sale"
          ? { buyerId: "converted-buyer", fiscalValue: 90000 }
          : { tenantId: "converted-tenant" },
      ),
      expect.any(Function),
    );
  },
);
it("imports a buyer without a CRM conversion and forwards optional dates only when supplied", async () => {
  const { container } = await mount();
  select("Tipo de contrato", "sale");
  prepare(container, "buyer");
  submit(container);
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  expect(interestedApi.convertToBuyer).not.toHaveBeenCalled();
  expect(submitLeaseImport).toHaveBeenCalledWith(
    "company",
    "admin",
    expect.objectContaining({
      buyerId: "buyer",
      startDate: undefined,
      rentAmount: undefined,
    }),
    expect.any(Function),
  );
});
it("opens the most recent active contract and never creates a duplicate", async () => {
  jest.mocked(leasesApi.getAll).mockResolvedValue([
    {
      id: "old",
      contractType: "rental",
      propertyId: "property",
      tenantId: "tenant-canonical",
      status: "ACTIVE",
      updatedAt: "2026-01-01",
    },
    {
      id: "new",
      contractType: "rental",
      propertyId: "property",
      tenantId: "tenant-canonical",
      status: "ACTIVE",
      updatedAt: "2026-09-01",
    },
    {
      id: "finalized",
      contractType: "rental",
      propertyId: "property",
      tenantId: "tenant-canonical",
      status: "FINALIZED",
      updatedAt: "2026-10-01",
    },
  ] as never);
  const { container } = await mount();
  prepare(container);
  expect(
    screen.getByRole("link", { name: "Abrir contrato existente" }),
  ).toHaveAttribute("href", "/es/leases/new");
  submit(container);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/leases/new"));
  expect(submitLeaseImport).not.toHaveBeenCalled();
});
it("fetches later CRM pages and keeps API failure visible with a working retry", async () => {
  jest.mocked(propertiesApi.getAll).mockRejectedValueOnce(new Error("offline"));
  const { container } = await mount();
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar");
  prepare(container);
  submit(container);
  expect(submitLeaseImport).not.toHaveBeenCalled();
  jest
    .mocked(interestedApi.getAll)
    .mockResolvedValueOnce({
      data: [profile, converted],
      page: 1,
      limit: 2,
      total: 3,
    } as never)
    .mockResolvedValueOnce({
      data: [{ ...profile, id: "page2", firstName: "Later" }],
      page: 2,
      limit: 2,
      total: 3,
    } as never);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByRole("option", { name: "Later Prospect" });
  expect(interestedApi.getAll).toHaveBeenCalledWith({ page: 2, limit: 100 });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("requires the source file and preserves the form when conversion fails", async () => {
  const { container } = await mount();
  submit(container);
  expect(submitLeaseImport).not.toHaveBeenCalled();
  prepare(container, "interested:prospect");
  jest
    .mocked(interestedApi.convertToTenant)
    .mockRejectedValueOnce(new Error("denied"));
  submit(container);
  await waitFor(() => expect(window.alert).toHaveBeenCalled());
  expect(screen.getByLabelText("Propiedad")).toHaveValue("property");
  expect(submitLeaseImport).not.toHaveBeenCalled();
});
it("does not load operational data while authentication is pending", () => {
  mockAuthLoading = true;
  const { container } = render(<Page />);
  expect(container.querySelector(".animate-spin")).not.toBeNull();
  expect(propertiesApi.getAll).not.toHaveBeenCalled();
});
