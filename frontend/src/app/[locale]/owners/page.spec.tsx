import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "./page";
import { ownersApi } from "@/lib/api/owners";
import { propertiesApi } from "@/lib/api/properties";
import { leasesApi } from "@/lib/api/leases";
import type { User } from "@/types/auth";

const mockTranslate = (key: string) => key;
const mockPush = jest.fn();
let mockUser: User;
let mockLoading = false;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: mockLoading }),
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ push: mockPush }),
}));
jest.mock("@/lib/api/owners", () => ({
  ownersApi: {
    getAll: jest.fn(),
    getPage: jest.fn(),
    getMyProfile: jest.fn(),
    getSettlements: jest.fn(),
    downloadSettlementReceipt: jest.fn(),
  },
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getAll: jest.fn(), getMaintenanceTasks: jest.fn() },
}));
jest.mock("@/lib/api/leases", () => ({
  leasesApi: { getAll: jest.fn(), renew: jest.fn() },
}));
jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));
const owners = jest.mocked(ownersApi);
const properties = jest.mocked(propertiesApi);
const leases = jest.mocked(leasesApi);
const owner = {
  id: "o1",
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@example.com",
  phone: "123",
};
const property = {
  id: "p1",
  ownerId: "o1",
  name: "Casa Centro",
  operations: ["rent", "sale"],
  rentPrice: 500,
  salePrice: 20000,
  saleCurrency: "USD",
  address: { street: "San Martín", number: "20", city: "Córdoba" },
};
const lease = {
  id: "lease1",
  propertyId: "p1",
  status: "ACTIVE",
  contractType: "rental",
  endDate: "2099-12-31",
  updatedAt: "2026-01-01",
  createdAt: "2025-01-01",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    id: "admin",
    role: "admin",
    email: null,
    firstName: "Admin",
    lastName: "",
    permissions: {},
  };
  mockLoading = false;
  owners.getAll.mockResolvedValue([
    owner,
    { ...owner, id: "o2", firstName: "Luis", email: null, phone: undefined },
  ] as never);
  owners.getPage.mockImplementation(async (filters) => {
    const data = [
      owner,
      { ...owner, id: "o2", firstName: "Luis", email: null, phone: undefined },
    ].filter((item) =>
      `${item.firstName} ${item.email ?? ""}`
        .toLowerCase()
        .includes(filters?.search?.toLowerCase() ?? ""),
    );
    return {
      data,
      total: data.length,
      page: filters?.page ?? 1,
      limit: 20,
    } as never;
  });
  owners.getMyProfile.mockResolvedValue(owner as never);
  owners.getSettlements.mockResolvedValue([]);
  owners.downloadSettlementReceipt.mockResolvedValue();
  properties.getAll.mockResolvedValue([
    property,
    { ...property, id: "orphan", ownerId: undefined },
  ] as never);
  properties.getMaintenanceTasks.mockResolvedValue([]);
  leases.getAll.mockResolvedValue([lease] as never);
  leases.renew.mockResolvedValue({ ...lease, id: "renewed" } as never);
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
async function mount() {
  const view = render(<Page />);
  await screen.findAllByTestId("owner-row-main");
  return view;
}
async function select() {
  fireEvent.click(screen.getAllByTestId("owner-row-toggle")[0]);
  await screen.findByText("ownerNoRecentPayments");
}

it("searches owners independently and keeps property and person destinations distinct", async () => {
  await mount();
  expect(screen.getByRole("link", { name: "addOwner" })).toHaveAttribute(
    "href",
    "/es/properties/owners/new",
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "ANA@" },
  });
  await waitFor(() =>
    expect(screen.getAllByTestId("owner-row-main")).toHaveLength(1),
  );
  await select();
  expect(screen.getByTestId("property-view-link-p1")).toHaveAttribute(
    "href",
    "/es/properties/p1",
  );
  expect(screen.getByRole("link", { name: "viewLease" })).toHaveAttribute(
    "href",
    "/es/leases/lease1",
  );
  fireEvent.click(screen.getByTestId("owner-row-toggle"));
  expect(screen.queryByText("Casa Centro")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "missing" },
  });
  expect(await screen.findByText("noOwners")).toBeVisible();
});

it("loads recent maintenance once, sorts it and allows collapsing the property", async () => {
  properties.getMaintenanceTasks.mockResolvedValue([
    {
      id: "t1",
      title: "Repair",
      notes: "Kitchen",
      scheduledAt: "2026-01-02",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
    },
    {
      id: "t2",
      title: "Inspection",
      scheduledAt: "2026-01-01",
      createdAt: "2025-12-31",
      updatedAt: "",
    },
  ] as never);
  await mount();
  await select();
  const toggle = screen.getByRole("button", {
    name: "recentMaintenanceTasks: Casa Centro",
  });
  fireEvent.click(toggle);
  expect(await screen.findByText("Kitchen")).toBeVisible();
  expect(screen.getByText("Inspection")).toBeVisible();
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  await screen.findByText("Repair");
  expect(properties.getMaintenanceTasks).toHaveBeenCalledTimes(1);
});

it("preserves maintenance errors and retries instead of caching a false empty result", async () => {
  properties.getMaintenanceTasks.mockRejectedValueOnce(new Error("offline"));
  await mount();
  await select();
  const toggle = screen.getByRole("button", {
    name: "recentMaintenanceTasks: Casa Centro",
  });
  fireEvent.click(toggle);
  await screen.findByRole("alert");
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(properties.getMaintenanceTasks).toHaveBeenCalledTimes(2),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});

it("renders settlement currency data, pending documents and authenticated downloads", async () => {
  owners.getSettlements.mockResolvedValue([
    {
      id: "s1",
      period: "2026-01",
      netAmount: 200,
      currencyCode: "USD",
      processedAt: "2026-01-02",
      receiptPdfUrl: "db://s1",
      receiptName: "receipt.pdf",
    },
    {
      id: "s2",
      period: "2026-02",
      netAmount: 300,
      currencyCode: "ARS",
      processedAt: null,
      receiptPdfUrl: null,
    },
  ] as never);
  await mount();
  fireEvent.click(screen.getAllByTestId("owner-row-toggle")[0]);
  await screen.findByText("ownerReceiptPending");
  expect(screen.getByText(/2026-01.*USD/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "downloadOwnerReceipt" }));
  expect(owners.downloadSettlementReceipt).toHaveBeenCalledWith(
    "s1",
    "receipt.pdf",
  );
  owners.downloadSettlementReceipt.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "downloadOwnerReceipt" }));
  await screen.findByRole("alert");
});

it("retries settlements after failed reads and shows owners without properties", async () => {
  owners.getSettlements.mockRejectedValueOnce(new Error("offline"));
  await mount();
  fireEvent.click(screen.getAllByTestId("owner-row-toggle")[0]);
  await screen.findByRole("alert");
  fireEvent.click(screen.getAllByTestId("owner-row-toggle")[0]);
  fireEvent.click(screen.getAllByTestId("owner-row-toggle")[0]);
  await waitFor(() => expect(owners.getSettlements).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getAllByTestId("owner-row-toggle")[1]);
  expect(screen.getByText("ownerNoProperties")).toBeVisible();
});

it.each(["DRAFT", "FINALIZED"])(
  "opens %s leases when no renewal is required",
  async (status) => {
    leases.getAll.mockResolvedValue([
      {
        ...lease,
        status,
        contractType: "sale",
        endDate: undefined,
        updatedAt: "",
      },
      { ...lease, id: "unassigned", propertyId: undefined },
    ] as never);
    await mount();
    await select();
    expect(screen.getByRole("link", { name: "viewLease" })).toHaveAttribute(
      "href",
      "/es/leases/lease1",
    );
  },
);

it("creates contracts when none exists, including missing price and owner contact fallbacks", async () => {
  owners.getPage.mockResolvedValue({
    data: [{ ...owner, firstName: "", lastName: "" }],
    total: 1,
    page: 1,
    limit: 20,
  } as never);
  properties.getAll.mockResolvedValue([
    {
      ...property,
      salePrice: undefined,
      rentPrice: undefined,
      saleCurrency: undefined,
    },
  ] as never);
  leases.getAll.mockResolvedValue([]);
  await mount();
  await select();
  expect(leases.getAll).toHaveBeenCalledWith({ includeFinalized: true });
  expect(
    screen.getByRole("link", { name: "createLease" }).getAttribute("href"),
  ).toContain("ownerName=ana%40example.com");
});

it("renews an expired rental and reports mutation failure without navigating", async () => {
  leases.getAll.mockResolvedValue([
    { ...lease, endDate: "2020-01-01" },
  ] as never);
  await mount();
  await select();
  fireEvent.click(screen.getByRole("button", { name: "renewLease" }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/leases/renewed"));
  await screen.findByRole("button", { name: "renewLease" });
  leases.renew.mockRejectedValueOnce(new Error("conflict"));
  fireEvent.click(screen.getByRole("button", { name: "renewLease" }));
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith("error"));
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it("shows failed initial and lease reads with recovery instead of an empty portfolio", async () => {
  owners.getPage.mockRejectedValueOnce(new Error("offline"));
  render(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByText("noOwners")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findAllByTestId("owner-row-main");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("rejects incomplete lease data and supports recovery", async () => {
  leases.getAll.mockRejectedValueOnce(new Error("offline"));
  render(<Page />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findAllByTestId("owner-row-main");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("loads only the external owner's profile and hides administrative actions", async () => {
  mockUser = { ...mockUser, role: "owner" };
  await mount();
  await select();
  expect(owners.getMyProfile).toHaveBeenCalledTimes(1);
  expect(owners.getPage).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("link", { name: "addOwner" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "addProperty" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "edit" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "ownerPayouts" }),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId("property-view-link-p1")).toBeVisible();
});

it("waits for authentication and respects staff module permissions", async () => {
  mockLoading = true;
  mockUser = { ...mockUser, role: "staff", permissions: { owners: true } };
  const view = render(<Page />);
  expect(owners.getPage).not.toHaveBeenCalled();
  mockLoading = false;
  view.rerender(<Page />);
  await screen.findAllByTestId("owner-row-main");
  await select();
  expect(screen.getByRole("link", { name: "addOwner" })).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "createLease" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "addProperty" }),
  ).not.toBeInTheDocument();
  expect(properties.getAll).not.toHaveBeenCalled();
  expect(leases.getAll).not.toHaveBeenCalled();
  expect(screen.getByText("accessDeniedMessage")).toBeInTheDocument();
});

it("finds a later server page and resets pagination on search", async () => {
  owners.getPage.mockResolvedValue({
    data: [owner],
    total: 23,
    page: 1,
    limit: 20,
  } as never);
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await waitFor(() =>
    expect(owners.getPage).toHaveBeenLastCalledWith({
      page: 2,
      limit: 20,
      search: "",
    }),
  );
  await screen.findAllByTestId("owner-row-main");
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Belgrano" },
  });
  await waitFor(() =>
    expect(owners.getPage).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      search: "Belgrano",
    }),
  );
});
