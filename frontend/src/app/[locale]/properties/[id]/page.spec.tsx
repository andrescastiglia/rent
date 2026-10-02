import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import PropertyDetailPage from "./page";
import { propertiesApi } from "@/lib/api/properties";
import { leasesApi } from "@/lib/api/leases";
import type { Property } from "@/types/property";
import type { Lease } from "@/types/lease";
import type { User } from "@/types/auth";

const mockAuth: { user: User | null; loading: boolean } = {
  user: null,
  loading: false,
};
const mockPush = jest.fn();
let mockId: string | string[] | undefined = "property";
const mockT = (key: string) => key;
jest.mock("next/navigation", () => ({ useParams: () => ({ id: mockId }) }));
jest.mock("next-intl", () => ({
  useTranslations: () => mockT,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ push: mockPush }),
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: {
    getById: jest.fn(),
    getVisits: jest.fn(),
    getMaintenanceTasks: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock("@/lib/api/leases", () => ({
  leasesApi: { getAll: jest.fn(), renew: jest.fn() },
}));
const property: Property = {
  id: "property",
  name: "Casa Central",
  type: "HOUSE",
  status: "ACTIVE",
  ownerId: "owner",
  address: {
    street: "Central",
    number: "42",
    city: "CABA",
    state: "BA",
    zipCode: "1000",
    country: "AR",
  },
  operations: ["rent", "sale"],
  rentPrice: 1000,
  salePrice: 200000,
  saleCurrency: "USD",
  ownerWhatsapp: "+5411",
  description: "Family house",
  features: [
    { id: "garden", name: "Garden", value: "20m2" },
    { id: "balcony", name: "Balcony" },
  ],
  units: [
    {
      id: "unit",
      unitNumber: "1",
      bedrooms: 2,
      bathrooms: 1,
      area: 100,
      status: "OCCUPIED",
      rentAmount: 1000,
    },
  ],
  images: ["https://example.com/first.jpg", "https://example.com/second.jpg"],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
const lease = {
  id: "lease",
  propertyId: "property",
  contractType: "rental",
  status: "ACTIVE",
  endDate: "2999-01-01",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
} as Lease;
const api = jest.mocked(propertiesApi),
  contracts = jest.mocked(leasesApi);
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.loading = false;
  mockAuth.user = {
    id: "admin",
    companyId: "company",
    role: "admin",
    email: null,
    firstName: "Admin",
    lastName: "User",
  };
  mockId = "property";
  api.getById.mockResolvedValue(property);
  api.getVisits.mockResolvedValue([]);
  api.getMaintenanceTasks.mockResolvedValue([]);
  api.delete.mockResolvedValue(undefined);
  contracts.getAll.mockResolvedValue([]);
  contracts.renew.mockResolvedValue({ ...lease, id: "renewed" });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(window, "alert").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it("renders property evidence, scoped action routes, currency, statistics and cyclic image navigation", async () => {
  mockId = ["property"];
  api.getVisits.mockResolvedValue([
    {
      id: "visit",
      propertyId: "property",
      interestedName: "Buyer",
      comments: "Offer received",
      hasOffer: true,
      offerAmount: 150000,
      offerCurrency: "USD",
      result: "offer",
      visitedAt: "2026-10-01",
      createdAt: "",
      updatedAt: "",
    },
  ]);
  api.getMaintenanceTasks.mockResolvedValue([
    {
      id: "task",
      propertyId: "property",
      title: "Repair roof",
      notes: "Urgent",
      scheduledAt: "2026-10-02",
      createdAt: "",
      updatedAt: "",
    },
  ]);
  render(<PropertyDetailPage />);
  await screen.findByRole("heading", { name: "Casa Central" });
  expect(api.getById).toHaveBeenCalledWith("property");
  expect(screen.getByText("200.000 USD")).toBeInTheDocument();
  expect(screen.getByText("Offer received")).toBeInTheDocument();
  expect(screen.getByText("Repair roof")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mercado Libre" })).toHaveAttribute(
    "href",
    "/es/properties/property/portals",
  );
  expect(screen.getByRole("link", { name: "createLease" })).toHaveAttribute(
    "href",
    expect.stringContaining("propertyOperations=rent%2Csale"),
  );
  expect(screen.getByRole("img", { name: "Casa Central" })).toHaveAttribute(
    "src",
    "https://example.com/first.jpg",
  );
  fireEvent.click(screen.getByRole("button", { name: "nextImage" }));
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    "https://example.com/second.jpg",
  );
  fireEvent.click(screen.getByRole("button", { name: "nextImage" }));
  expect(screen.getByText("1 / 2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "previousImage" }));
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
});
it.each(["owner", "tenant", "buyer"] as const)(
  "keeps %s property access read only",
  async (role) => {
    mockAuth.user = { ...mockAuth.user!, role };
    render(<PropertyDetailPage />);
    await screen.findByRole("heading", { name: "Casa Central" });
    expect(
      screen.queryByRole("link", { name: "edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Registrar visita" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "saveMaintenanceTask" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "createLease" }),
    ).not.toBeInTheDocument();
  },
);
it("uses staff module permissions separately for property and lease actions", async () => {
  mockAuth.user = {
    ...mockAuth.user!,
    role: "staff",
    permissions: { properties: true, leases: false },
  };
  const view = render(<PropertyDetailPage />);
  await screen.findByRole("heading", { name: "Casa Central" });
  expect(screen.getByRole("link", { name: "edit" })).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "createLease" }),
  ).not.toBeInTheDocument();
  mockAuth.user = {
    ...mockAuth.user!,
    permissions: { properties: false, leases: true },
  };
  view.rerender(<PropertyDetailPage />);
  await screen.findByRole("heading", { name: "Casa Central" });
  expect(screen.queryByRole("link", { name: "edit" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "createLease" })).toBeInTheDocument();
});
it("shows empty records honestly with no inferred price, descriptions, images, features or tasks", async () => {
  api.getById.mockResolvedValue({
    ...property,
    images: [],
    features: [],
    description: undefined,
    operations: [],
    operationState: undefined,
    ownerWhatsapp: undefined,
    rentPrice: undefined,
    salePrice: undefined,
    saleCurrency: undefined,
  });
  api.getVisits.mockResolvedValue([
    {
      id: "v",
      propertyId: "property",
      visitedAt: "2026-10-01",
      createdAt: "",
      updatedAt: "",
    },
  ]);
  render(<PropertyDetailPage />);
  await screen.findByRole("heading", { name: "Casa Central" });
  expect(screen.getByText("noDescription")).toBeInTheDocument();
  expect(screen.getByText("noFeatures")).toBeInTheDocument();
  expect(screen.getByText("noMaintenanceTasks")).toBeInTheDocument();
  expect(screen.getByText("noOwnerWhatsapp")).toBeInTheDocument();
  expect(screen.getByText("Interesado sin nombre")).toBeInTheDocument();
  expect(screen.getByText("Sin oferta registrada")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "createLease" }),
  ).not.toBeInTheDocument();
});
it.each(["DRAFT", "ACTIVE", "FINALIZED"] as const)(
  "resolves a %s contract to its complete detail route",
  async (status) => {
    contracts.getAll.mockResolvedValue([
      { ...lease, status, contractType: "sale", endDate: undefined },
    ]);
    render(<PropertyDetailPage />);
    await screen.findByRole("heading", { name: "Casa Central" });
    expect(screen.getByRole("link", { name: "viewLease" })).toHaveAttribute(
      "href",
      "/es/leases/lease",
    );
  },
);
it("merges successful status queries, filters foreign properties and renews the newest expired rental", async () => {
  contracts.getAll.mockImplementation(async (filter) => {
    if (filter?.status === "DRAFT") throw new Error("Unavailable status");
    if (filter?.status === "ACTIVE")
      return [
        { ...lease, id: "expired", endDate: "2000-01-01" },
        { ...lease, id: "foreign", propertyId: "foreign" },
      ];
    return [
      {
        ...lease,
        id: "older",
        status: "FINALIZED",
        endDate: "1999-01-01",
        updatedAt: "2020-01-01",
      },
    ];
  });
  let finish!: (value: Lease) => void;
  contracts.renew.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<PropertyDetailPage />);
  fireEvent.click(await screen.findByRole("button", { name: "renewLease" }));
  expect(screen.getByRole("button", { name: "renewLease" })).toBeDisabled();
  expect(contracts.renew).toHaveBeenCalledWith("expired");
  await act(async () => finish({ ...lease, id: "renewed" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/leases/renewed"));
});
it("retains errors from renewal and deletion and honors an explicit delete cancellation", async () => {
  contracts.getAll.mockResolvedValue([{ ...lease, endDate: "2000-01-01" }]);
  contracts.renew.mockRejectedValueOnce(new Error("Conflict"));
  api.delete.mockRejectedValueOnce(new Error("Forbidden"));
  render(<PropertyDetailPage />);
  fireEvent.click(await screen.findByRole("button", { name: "renewLease" }));
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith("error"));
  jest.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "delete" }));
  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "delete" }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("property"));
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "delete" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/properties"));
});
it("distinguishes a read failure from a missing property and retries the complete record", async () => {
  api.getVisits.mockRejectedValueOnce(new Error("Offline"));
  contracts.getAll.mockRejectedValue(new Error("No leases"));
  render(<PropertyDetailPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("loadError");
  expect(screen.queryByText("notFound")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByRole("heading", { name: "Casa Central" });
  expect(contracts.getAll).toHaveBeenCalledWith({ includeFinalized: true });
});
it("shows a missing property and does not query without authentication or an identifier", async () => {
  mockAuth.loading = true;
  const view = render(<PropertyDetailPage />);
  expect(api.getById).not.toHaveBeenCalled();
  mockAuth.loading = false;
  mockAuth.user = null;
  view.rerender(<PropertyDetailPage />);
  await screen.findByText("notFound");
  mockAuth.user = {
    id: "admin",
    role: "admin",
    email: null,
    firstName: "Admin",
    lastName: "User",
  };
  mockId = undefined;
  view.rerender(<PropertyDetailPage />);
  expect(api.getById).not.toHaveBeenCalled();
});
it("ignores stale property responses after actor change instead of exposing the previous company", async () => {
  let finish!: (value: Property | null) => void;
  api.getById.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<PropertyDetailPage />);
  mockAuth.user = { ...mockAuth.user!, companyId: "other", id: "other" };
  api.getById.mockResolvedValueOnce(null);
  view.rerender(<PropertyDetailPage />);
  await screen.findByText("notFound");
  await act(async () => finish(property));
  expect(
    screen.queryByRole("heading", { name: "Casa Central" }),
  ).not.toBeInTheDocument();
});
