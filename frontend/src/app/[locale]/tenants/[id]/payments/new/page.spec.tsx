import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import TenantPaymentRegistrationPage from "./page";
import { tenantsApi } from "@/lib/api/tenants";
import {
  invoicesApi,
  paymentsApi,
  tenantAccountsApi,
} from "@/lib/api/payments";
import { ApiRequestError } from "@/lib/api";
import type { User } from "@/types/auth";
import type { Tenant } from "@/types/tenant";
import type { Lease } from "@/types/lease";
import type { Invoice, TenantAccountMovement } from "@/types/payment";

const mockAuth: { user: User | null; loading: boolean } = {
  user: null,
  loading: false,
};
const mockPush = jest.fn();
let mockId: string | string[] | undefined = "tenant";
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
jest.mock("@/lib/api/tenants", () => ({
  tenantsApi: { getById: jest.fn(), getLeaseHistory: jest.fn() },
}));
jest.mock("@/lib/api/payments", () => ({
  invoicesApi: { getAll: jest.fn() },
  paymentsApi: { create: jest.fn() },
  tenantAccountsApi: {
    getByLease: jest.fn(),
    getBalance: jest.fn(),
    getMovements: jest.fn(),
  },
}));
jest.mock("@/components/common/CurrencySelect", () => ({
  CurrencySelect: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label="currency"
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="ARS">ARS</option>
      <option value="USD">USD</option>
    </select>
  ),
}));
const tenant: Tenant = {
  id: "tenant",
  firstName: "Ana",
  lastName: "Tenant",
  email: "a@example.com",
  phone: "123",
  dni: "123",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
};
const lease = {
  id: "lease",
  propertyId: "property",
  status: "ACTIVE",
  currency: "USD",
  property: { name: "Casa Central" },
} as Lease;
const invoice = {
  id: "invoice",
  invoiceNumber: "INV-1",
  dueDate: "2026-10-01",
  status: "partial",
  total: 100,
  amountPaid: 40,
  currencyCode: "USD",
} as Invoice;
const api = jest.mocked(tenantsApi),
  accounts = jest.mocked(tenantAccountsApi),
  invoices = jest.mocked(invoicesApi),
  payments = jest.mocked(paymentsApi);
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
  mockId = "tenant";
  api.getById.mockResolvedValue(tenant);
  api.getLeaseHistory.mockResolvedValue([lease]);
  accounts.getByLease.mockResolvedValue({
    id: "account",
    leaseId: "lease",
    balance: 100,
    lastMovementAt: null,
    createdAt: "",
    updatedAt: "",
  });
  accounts.getBalance.mockResolvedValue({
    balance: 100,
    lateFee: 20,
    total: 120,
  });
  accounts.getMovements.mockResolvedValue([]);
  invoices.getAll.mockResolvedValue({
    data: [invoice],
    total: 1,
    page: 1,
    limit: 100,
  });
  payments.create.mockResolvedValue({ id: "payment" } as never);
});
async function loaded() {
  await screen.findByRole("button", { name: "savePayment" });
}
function submit() {
  fireEvent.submit(document.querySelector("form")!);
}
it("waits for authentication and permits only staff with explicit payment permission", async () => {
  mockAuth.loading = true;
  const view = render(<TenantPaymentRegistrationPage />);
  expect(screen.getByText("review")).toBeInTheDocument();
  expect(api.getById).not.toHaveBeenCalled();
  mockAuth.loading = false;
  mockAuth.user = { ...mockAuth.user!, role: "staff" };
  view.rerender(<TenantPaymentRegistrationPage />);
  expect(screen.getByText("unavailable")).toBeInTheDocument();
  mockAuth.user = { ...mockAuth.user!, permissions: { payments: true } };
  view.rerender(<TenantPaymentRegistrationPage />);
  await loaded();
  expect(api.getById).toHaveBeenCalledWith("tenant");
});
it("loads the active contract, oldest open invoice first across pages, and movement signs with currency", async () => {
  mockId = ["tenant"];
  invoices.getAll
    .mockResolvedValueOnce({
      data: [
        invoice,
        { ...invoice, id: "closed", invoiceNumber: "CLOSED", status: "paid" },
        { ...invoice, id: "zero", invoiceNumber: "ZERO", amountPaid: 100 },
      ],
      total: 4,
      page: 1,
      limit: 3,
    })
    .mockResolvedValueOnce({
      data: [
        {
          ...invoice,
          id: "older",
          invoiceNumber: "INV-OLD",
          dueDate: "2026-09-01",
          status: "overdue",
          total: 80,
          amountPaid: 10,
        },
      ],
      total: 4,
      page: 2,
      limit: 3,
    });
  accounts.getMovements.mockResolvedValue([
    {
      id: "charge",
      description: "Rent charge",
      amount: 100,
      balanceAfter: 100,
      movementDate: "2026-10-01",
    },
    {
      id: "payment",
      description: "Collection",
      amount: -40,
      balanceAfter: 60,
      movementDate: "2026-10-02",
    },
  ] as TenantAccountMovement[]);
  render(<TenantPaymentRegistrationPage />);
  await loaded();
  expect(screen.getByText("Ana Tenant")).toBeInTheDocument();
  expect(screen.getByText("Casa Central")).toBeInTheDocument();
  expect(screen.getByLabelText("currency")).toHaveValue("USD");
  expect(invoices.getAll).toHaveBeenNthCalledWith(2, {
    leaseId: "lease",
    page: 2,
    limit: 100,
  });
  expect(screen.queryByText("CLOSED")).not.toBeInTheDocument();
  expect(screen.queryByText("ZERO")).not.toBeInTheDocument();
  expect(screen.getByText("USD 70")).toBeInTheDocument();
  const oldest = screen.getByText("INV-OLD"),
    newer = screen.getByText("INV-1");
  expect(
    oldest.compareDocumentPosition(newer) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText("Rent charge")).toBeInTheDocument();
  expect(screen.getByText("-40")).toHaveClass("text-green-700");
});
it("submits complete user-selected details and navigates to the durable payment identifier", async () => {
  render(<TenantPaymentRegistrationPage />);
  await loaded();
  fireEvent.change(screen.getByLabelText("paymentRegistration.amount"), {
    target: { value: "60.25" },
  });
  fireEvent.change(screen.getByLabelText("date"), {
    target: { value: "2026-10-02" },
  });
  fireEvent.change(screen.getByLabelText("method.label"), {
    target: { value: "cash" },
  });
  fireEvent.change(screen.getByLabelText("currency"), {
    target: { value: "ARS" },
  });
  fireEvent.change(screen.getByLabelText("paymentRegistration.reference"), {
    target: { value: "REF-42" },
  });
  fireEvent.change(screen.getByLabelText("paymentRegistration.notes"), {
    target: { value: "Partial collection" },
  });
  submit();
  await waitFor(() =>
    expect(payments.create).toHaveBeenCalledWith({
      tenantAccountId: "account",
      amount: 60.25,
      currencyCode: "ARS",
      paymentDate: "2026-10-02",
      method: "cash",
      activityType: "monthly",
      reference: "REF-42",
      notes: "Partial collection",
    }),
  );
  expect(mockPush).toHaveBeenCalledWith("/payments/payment");
});
it.each(["0", "-1", "", "NaN"])(
  "rejects invalid amount %s without sending a mutation",
  async (amount) => {
    render(<TenantPaymentRegistrationPage />);
    await loaded();
    fireEvent.change(screen.getByLabelText("paymentRegistration.amount"), {
      target: { value: amount },
    });
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "errors.invalidPaymentAmount",
    );
    expect(payments.create).not.toHaveBeenCalled();
  },
);
it("locks the original uncertain payment, recovers it explicitly and ignores simultaneous resubmission", async () => {
  payments.create.mockRejectedValueOnce(new Error("Offline"));
  render(<TenantPaymentRegistrationPage />);
  await loaded();
  fireEvent.change(screen.getByLabelText("paymentRegistration.amount"), {
    target: { value: "10" },
  });
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("uncertain");
  expect(screen.getByLabelText("paymentRegistration.amount")).toBeDisabled();
  let finish!: (value: never) => void;
  payments.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  submit();
  expect(payments.create).toHaveBeenCalledTimes(2);
  expect(payments.create.mock.calls[1][0]).toEqual(
    payments.create.mock.calls[0][0],
  );
  expect(payments.create.mock.calls[0][0]).toEqual(
    expect.objectContaining({ reference: undefined, notes: undefined }),
  );
  await act(async () => finish({ id: "recovered" } as never));
  expect(mockPush).toHaveBeenCalledWith("/payments/recovered");
});
it("keeps definite rejection editable and clears amount validation after correction", async () => {
  payments.create.mockRejectedValueOnce(new ApiRequestError(422, "Invalid"));
  render(<TenantPaymentRegistrationPage />);
  await loaded();
  submit();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "errors.invalidPaymentAmount",
  );
  fireEvent.change(screen.getByLabelText("paymentRegistration.amount"), {
    target: { value: "10" },
  });
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("rejected");
  expect(screen.getByLabelText("paymentRegistration.amount")).toBeEnabled();
});
it("shows read failure and retries instead of implying a missing tenant", async () => {
  api.getById.mockRejectedValueOnce(new Error("Forbidden"));
  render(<TenantPaymentRegistrationPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("readError");
  expect(screen.queryByText("notFound")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await loaded();
  expect(api.getById).toHaveBeenCalledTimes(2);
});
it.each(["missing", "no-id", "no-active-lease", "no-account"])(
  "avoids fabricated payment accounts for %s",
  async (reason) => {
    if (reason === "missing") api.getById.mockResolvedValue(null);
    if (reason === "no-id") mockId = undefined;
    if (reason === "no-active-lease")
      api.getLeaseHistory.mockResolvedValue([
        { ...lease, status: "FINALIZED" },
      ]);
    if (reason === "no-account")
      accounts.getByLease.mockResolvedValue(null as never);
    render(<TenantPaymentRegistrationPage />);
    if (reason === "missing" || reason === "no-id")
      await screen.findByText("notFound");
    else {
      await screen.findByText("paymentRegistration.noAccount");
      expect(
        screen.queryByRole("button", { name: "savePayment" }),
      ).not.toBeInTheDocument();
    }
    expect(accounts.getBalance).not.toHaveBeenCalled();
    expect(payments.create).not.toHaveBeenCalled();
  },
);
it("offers honest empty invoice and movement states without hiding account data", async () => {
  invoices.getAll.mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    limit: 100,
  });
  accounts.getBalance.mockResolvedValue({ balance: 0, lateFee: 0, total: 0 });
  render(<TenantPaymentRegistrationPage />);
  await loaded();
  expect(
    screen.getByText("paymentRegistration.noPendingInvoices"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("paymentRegistration.noMovements"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("paymentRegistration.amount")).toHaveValue(null);
});
