import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import OwnerProperties from "./owner/properties/page";
import OwnerSettlements from "./owner/settlements/page";
import TenantDashboard from "./tenant/page";
import TenantContract from "./tenant/contract/page";
import { propertiesApi } from "@/lib/api/properties";
import { settlementsApi } from "@/lib/api/settlements";
import { tenantsApi } from "@/lib/api/tenants";
import { leasesApi } from "@/lib/api/leases";
import { paymentsApi } from "@/lib/api/payments";
let mockUser: {
  id: string;
  role: string;
  companyId?: string;
  firstName: string;
  lastName: string;
} | null;
let mockLoading = false;
let mockLocale = "es";
const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
jest.mock("next-intl", () => ({
  useLocale: () => mockLocale,
  useTranslations: () => (key: string) => key,
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: mockLoading }),
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => mockRouter,
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getAll: jest.fn() },
}));
jest.mock("@/lib/api/settlements", () => ({
  settlementsApi: { getAll: jest.fn(), downloadReceipt: jest.fn() },
}));
jest.mock("@/lib/api/tenants", () => ({
  tenantsApi: { getMySummary: jest.fn() },
}));
jest.mock("@/lib/api/leases", () => ({ leasesApi: { getAll: jest.fn() } }));
jest.mock("@/lib/api/payments", () => ({ paymentsApi: { getAll: jest.fn() } }));
jest.mock("@/components/leases/ContractDocument", () => ({
  ContractDocument: ({
    leaseId,
    scopeKey,
  }: {
    leaseId: string;
    scopeKey: string;
  }) => (
    <section aria-label="Documentos" data-lease={leaseId} data-scope={scopeKey}>
      Contrato autorizado
    </section>
  ),
}));
const propsApi = jest.mocked(propertiesApi);
const settlementApi = jest.mocked(settlementsApi);
const tenantApi = jest.mocked(tenantsApi);
const leaseApi = jest.mocked(leasesApi);
const paymentApi = jest.mocked(paymentsApi);
const summary = {
  accountBalance: 24.25,
  pendingInvoicesCount: 2,
  nextPaymentDue: "2026-10-10",
  activeLease: { id: "lease", status: "ACTIVE", currency: "USD" },
  monthlySummary: {
    period: "2026-10",
    pendingAmount: 24.25,
    nextAdjustmentDate: "2026-10-15",
    adjustmentDueThisMonth: true,
    contractEndDate: "2026-10-30",
    contractExpiresThisMonth: true,
  },
};
const lease = {
  id: "lease",
  status: "ACTIVE",
  startDate: "2026-01-01",
  endDate: "2026-10-30",
  rentAmount: 1250.75,
  currency: "USD",
  billingFrequency: "monthly",
  property: {
    address: { street: "Principal", number: "42", unit: "3A", city: "Ciudad" },
  },
};
const payments = [
  {
    id: "pay1",
    amount: 15.25,
    currencyCode: "USD",
    paymentDate: "2026-10-02",
    status: "completed",
  },
  {
    id: "pay2",
    amount: 21.55,
    currencyCode: "ARS",
    paymentDate: null,
    status: "pending",
  },
  {
    id: "pay3",
    amount: 27.45,
    currencyCode: "BRL",
    paymentDate: "2026-10-01",
    status: "failed",
  },
  {
    id: "pay4",
    amount: 99999,
    currencyCode: "USD",
    paymentDate: "2026-09-01",
    status: "pending",
  },
];
const settlement = {
  id: "settlement",
  status: "completed",
  period: "2026-09",
  totalIncome: 1250.75,
  commissionAmount: 100.15,
  netAmount: 1150.6,
  currencyCode: "USD",
  receiptPdfUrl: "db://settlement/receipt",
  receiptName: "recibo.pdf",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  mockLocale = "es";
  mockUser = {
    id: "owner",
    role: "owner",
    companyId: "company",
    firstName: "Ana",
    lastName: "Pérez",
  };
  propsApi.getAll.mockResolvedValue([
    {
      id: "property",
      name: "Casa",
      address: { street: "Principal", number: "42", city: "Ciudad" },
      operationState: "rented",
      rentPrice: 2500.25,
    },
    {
      id: "empty-property",
      name: "Terreno",
      address: null,
      operationState: "available",
      rentPrice: 0,
    },
  ] as never);
  settlementApi.getAll.mockResolvedValue([settlement] as never);
  settlementApi.downloadReceipt.mockResolvedValue(undefined);
  tenantApi.getMySummary.mockResolvedValue(summary as never);
  leaseApi.getAll.mockResolvedValue([lease] as never);
  paymentApi.getAll.mockResolvedValue({
    data: payments,
    total: 4,
    page: 1,
    limit: 3,
  } as never);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it("shows own property addresses, fallback names, exact cents and localized detail links", async () => {
  render(<OwnerProperties />);
  await screen.findByText("Principal 42");
  expect(screen.getByText("$ 2.500,25")).toBeInTheDocument();
  expect(screen.getByText("Ciudad")).toBeInTheDocument();
  expect(screen.getByText("rented")).toBeInTheDocument();
  expect(screen.getByText("available")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Terreno/ })).toHaveAttribute(
    "href",
    "/es/properties/empty-property",
  );
});
it("distinguishes a failed owner property read from an empty collection and retries explicitly", async () => {
  propsApi.getAll
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([]);
  render(<OwnerProperties />);
  await screen.findByRole("alert");
  expect(screen.queryByText("noProperties")).not.toBeInTheDocument();
  expect(propsApi.getAll).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("noProperties");
  expect(propsApi.getAll).toHaveBeenCalledTimes(2);
});
it.each([OwnerProperties, OwnerSettlements])(
  "does not request owner data while auth is pending or unauthorized",
  async (Page) => {
    mockLoading = true;
    const view = render(<Page />);
    expect(propsApi.getAll).not.toHaveBeenCalled();
    expect(settlementApi.getAll).not.toHaveBeenCalled();
    mockLoading = false;
    mockUser = {
      id: "tenant",
      role: "tenant",
      firstName: "Ana",
      lastName: "Pérez",
    };
    view.rerender(<Page />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(propsApi.getAll).not.toHaveBeenCalled();
    expect(settlementApi.getAll).not.toHaveBeenCalled();
  },
);
it.each([OwnerProperties, OwnerSettlements])(
  "hides loaded owner data when a different role replaces the session",
  async (Page) => {
    const view = render(<Page />);
    await screen.findByRole("heading");
    mockUser = null;
    view.rerender(<Page />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  },
);
it("renders all historical settlement statuses and only offers completed stored receipts", async () => {
  settlementApi.getAll.mockResolvedValue(
    ["completed", "pending", "processing", "failed", "cancelled"].map(
      (status, index) => ({
        ...settlement,
        id: `settlement-${index}`,
        status,
        period: `2026-0${index + 1}`,
      }),
    ) as never,
  );
  render(<OwnerSettlements />);
  await screen.findByText("settlementStatus.completed");
  for (const status of ["pending", "processing", "failed", "cancelled"])
    expect(screen.getByText(`settlementStatus.${status}`)).toBeInTheDocument();
  expect(screen.getAllByText("US$ 1.150,60")).toHaveLength(5);
  expect(
    screen.getAllByRole("button", { name: "downloadReceipt" }),
  ).toHaveLength(1);
});
it("downloads the selected stored receipt once and shows a failed download without claiming success", async () => {
  let finish: () => void = () => undefined;
  settlementApi.downloadReceipt.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<OwnerSettlements />);
  await screen.findByText("2026-09");
  fireEvent.click(screen.getByRole("button", { name: "downloadReceipt" }));
  expect(
    screen.getByRole("button", { name: "downloadReceipt" }),
  ).toBeDisabled();
  await act(async () => finish());
  expect(settlementApi.downloadReceipt).toHaveBeenCalledWith(
    "settlement",
    "recibo.pdf",
  );
  settlementApi.downloadReceipt.mockRejectedValueOnce(new Error("missing"));
  fireEvent.click(screen.getByRole("button", { name: "downloadReceipt" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("downloadError");
  expect(screen.getByRole("button", { name: "downloadReceipt" })).toBeEnabled();
});
it("supports absent receipt names and a real empty settlement history after explicit retry", async () => {
  settlementApi.getAll
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([{ ...settlement, receiptName: null }] as never);
  render(<OwnerSettlements />);
  await screen.findByRole("alert");
  expect(screen.queryByText("noSettlements")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("2026-09");
  fireEvent.click(screen.getByRole("button", { name: "downloadReceipt" }));
  await waitFor(() =>
    expect(settlementApi.downloadReceipt).toHaveBeenCalledWith(
      "settlement",
      undefined,
    ),
  );
});
it("shows a successful empty owner settlement history without offering invented receipts", async () => {
  settlementApi.getAll.mockResolvedValueOnce([]);
  render(<OwnerSettlements />);
  await screen.findByText("noSettlements");
  expect(
    screen.queryByRole("button", { name: "downloadReceipt" }),
  ).not.toBeInTheDocument();
});
it("renders scoped tenant summary, three recent payments and operational links", async () => {
  mockUser = {
    id: "tenant",
    role: "tenant",
    companyId: "company",
    firstName: "Ana",
    lastName: "Pérez",
  };
  render(<TenantDashboard />);
  await screen.findByText("Ana Pérez");
  expect(tenantApi.getMySummary).toHaveBeenCalledTimes(1);
  expect(paymentApi.getAll).toHaveBeenCalledWith({ limit: 3 });
  expect(screen.getByText("leaseStatus.ACTIVE")).toBeInTheDocument();
  expect(screen.getByText("monthlySummary.dueThisMonth")).toBeInTheDocument();
  expect(
    screen.getByText("monthlySummary.expiresThisMonth"),
  ).toBeInTheDocument();
  expect(screen.getByText("completed")).toBeInTheDocument();
  expect(screen.getByText("failed")).toBeInTheDocument();
  expect(screen.queryByText(/99.999/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "viewContract" })).toHaveAttribute(
    "href",
    "/es/portal/tenant/contract",
  );
  expect(screen.getByRole("link", { name: "pay" })).toHaveAttribute(
    "href",
    "/es/portal/tenant/payments",
  );
});
it.each(["FINALIZED", "PENDING"])(
  "renders the tenant %s contract state without conflating balances",
  async (status) => {
    mockLocale = status === "FINALIZED" ? "en" : "pt";
    tenantApi.getMySummary.mockResolvedValueOnce({
      ...summary,
      pendingInvoicesCount: 1,
      activeLease: { ...summary.activeLease, status },
      nextPaymentDue: null,
      monthlySummary: {
        ...summary.monthlySummary,
        adjustmentDueThisMonth: false,
        contractExpiresThisMonth: false,
        nextAdjustmentDate: null,
        contractEndDate: null,
      },
    } as never);
    paymentApi.getAll.mockResolvedValueOnce({ data: [], total: 0 } as never);
    render(<TenantDashboard />);
    await screen.findByText(`leaseStatus.${status}`);
    expect(
      screen.getByText("monthlySummary.notDueThisMonth"),
    ).toBeInTheDocument();
    expect(screen.getByText("monthlySummary.current")).toBeInTheDocument();
    expect(screen.getByText("noPayments")).toBeInTheDocument();
  },
);
it("shows a real tenant empty state only after a successful summary read", async () => {
  tenantApi.getMySummary.mockResolvedValueOnce({
    ...summary,
    activeLease: null,
    accountBalance: 0,
    pendingInvoicesCount: 0,
  } as never);
  paymentApi.getAll.mockResolvedValueOnce({ data: [] } as never);
  render(<TenantDashboard />);
  await screen.findByText("noActiveContract");
  expect(screen.getByText("noPayments")).toBeInTheDocument();
});
it("blocks misleading zero balances after tenant summary failure and retries both reads", async () => {
  tenantApi.getMySummary.mockRejectedValueOnce(new Error("offline"));
  render(<TenantDashboard />);
  expect(await screen.findByRole("alert")).toHaveTextContent("readError");
  expect(screen.queryByText("pendingBalance")).not.toBeInTheDocument();
  expect(screen.queryByText("noActiveContract")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("leaseStatus.ACTIVE");
  expect(tenantApi.getMySummary).toHaveBeenCalledTimes(2);
});
it("selects the active contract, preserves address/unit and scopes access to its document", async () => {
  leaseApi.getAll.mockResolvedValueOnce([
    { ...lease, id: "finalized", status: "FINALIZED" },
    lease,
  ] as never);
  render(<TenantContract />);
  await screen.findByText("Principal 42 3A, Ciudad");
  expect(leaseApi.getAll).toHaveBeenCalledWith({ status: "ACTIVE" });
  expect(screen.getByText("leaseStatus.ACTIVE")).toBeInTheDocument();
  expect(screen.getByText("monthly")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Documentos" })).toHaveAttribute(
    "data-lease",
    "lease",
  );
  expect(screen.getByRole("region", { name: "Documentos" })).toHaveAttribute(
    "data-scope",
    "company:owner",
  );
});
it.each([
  ["en", "FINALIZED"],
  ["pt", "PENDING"],
])(
  "supports %s formatting and the %s fallback contract without inventing data",
  async (locale, status) => {
    mockLocale = locale;
    mockUser = {
      id: "tenant",
      role: "tenant",
      firstName: "Ana",
      lastName: "Pérez",
    };
    leaseApi.getAll.mockResolvedValueOnce([
      {
        ...lease,
        status,
        property: null,
        startDate: null,
        endDate: null,
        rentAmount: null,
        billingFrequency: null,
      },
    ] as never);
    tenantApi.getMySummary.mockResolvedValueOnce(null as never);
    render(<TenantContract />);
    await screen.findByText(`leaseStatus.${status}`);
    expect(screen.getAllByText("—").length).toBeGreaterThan(1);
    expect(
      screen.queryByRole("region", { name: "Documentos" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("pendingBalance")).not.toBeInTheDocument();
  },
);
it("supports an address without a unit", async () => {
  leaseApi.getAll.mockResolvedValueOnce([
    {
      ...lease,
      property: {
        address: { street: "Principal", number: "42", city: "Ciudad" },
      },
    },
  ] as never);
  render(<TenantContract />);
  expect(await screen.findByText("Principal 42, Ciudad")).toBeVisible();
});
it("does not present a failed contract read as no contract and supports explicit retry", async () => {
  leaseApi.getAll
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([]);
  render(<TenantContract />);
  expect(await screen.findByRole("alert")).toHaveTextContent("readError");
  expect(screen.queryByText("noActiveContract")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("noActiveContract");
  expect(leaseApi.getAll).toHaveBeenCalledTimes(2);
});
