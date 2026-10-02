import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Invoice } from "@/types/payment";
import InvoiceDetailPage from "./page";
import { invoicesApi } from "@/lib/api/payments";
import { paymentGatewayApi } from "@/lib/api/payment-gateway";

const mockAuth: {
  loading: boolean;
  user: {
    id: string;
    companyId: string;
    role: "admin" | "tenant" | "staff";
  } | null;
} = {
  loading: false,
  user: { id: "admin", companyId: "company", role: "admin" },
};
const mockNavigation: { id?: string | string[]; pay: string | null } = {
  id: "invoice",
  pay: null,
};
const mockT = (key: string) => key;
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("next/navigation", () => ({
  useParams: () => ({ id: mockNavigation.id }),
  useSearchParams: () => ({ get: () => mockNavigation.pay }),
}));
jest.mock("next-intl", () => ({
  useTranslations: () => mockT,
  useLocale: () => "es",
}));
jest.mock("@/lib/api/payments", () => ({
  invoicesApi: { getById: jest.fn() },
}));
jest.mock("@/lib/api/payment-gateway", () => ({
  paymentGatewayApi: { createPreference: jest.fn() },
}));
jest.mock("@/components/invoices/InvoiceDocument", () => ({
  InvoiceDocument: ({
    invoiceId,
    scopeKey,
  }: {
    invoiceId: string;
    scopeKey: string;
  }) => (
    <p data-testid="document">
      {invoiceId}:{scopeKey}
    </p>
  ),
}));
jest.mock("@/components/invoices/RentCalculationDetails", () => ({
  RentCalculationDetails: ({
    calculation,
  }: {
    calculation?: { version: number };
  }) =>
    calculation ? <p>Audited calculation v{calculation.version}</p> : null,
}));
const api = jest.mocked(invoicesApi),
  gateway = jest.mocked(paymentGatewayApi);
const invoice: Invoice = {
  id: "invoice",
  leaseId: "lease",
  ownerId: "owner",
  tenantAccountId: "account",
  invoiceNumber: "FAC-1",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  dueDate: "2026-10-10",
  subtotal: 1000,
  total: 1050.75,
  lateFee: 50,
  adjustments: 0.75,
  amountPaid: 100.25,
  currencyCode: "ARS",
  status: "partial",
  pdfUrl: null,
  issuedAt: null,
  notes: "Contrato de octubre",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.loading = false;
  mockAuth.user = { id: "admin", companyId: "company", role: "admin" };
  mockNavigation.id = "invoice";
  mockNavigation.pay = null;
  api.getById.mockResolvedValue(invoice);
  gateway.createPreference.mockResolvedValue({
    initPoint: "#checkout",
    sandboxInitPoint: "#sandbox",
    transactionId: "transaction",
  });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it("waits for authentication and renders nothing without a user", () => {
  mockAuth.loading = true;
  const view = render(<InvoiceDetailPage />);
  expect(api.getById).not.toHaveBeenCalled();
  mockAuth.loading = false;
  mockAuth.user = null;
  view.rerender(<InvoiceDetailPage />);
  expect(view.container).toBeEmptyDOMElement();
});
it("renders exact amounts, dated invoice evidence, linked payment route and scoped document", async () => {
  mockNavigation.id = ["invoice"];
  api.getById.mockResolvedValue({
    ...invoice,
    rentCalculation: { version: 1 },
  } as Invoice);
  render(<InvoiceDetailPage />);
  await screen.findByText("FAC-1");
  expect(api.getById).toHaveBeenCalledWith("invoice");
  expect(screen.getByText(/950,50/)).toBeInTheDocument();
  expect(screen.getByText("Contrato de octubre")).toBeInTheDocument();
  expect(screen.getByText("10/10/2026")).toBeInTheDocument();
  expect(screen.getByTestId("document")).toHaveTextContent(
    "invoice:company:admin",
  );
  expect(screen.getByText("Audited calculation v1")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "registerPayment" })).toHaveAttribute(
    "href",
    "/es/payments/new?leaseId=lease",
  );
});
it.each(["draft", "paid", "cancelled", "refunded"] as const)(
  "does not offer checkout for %s invoices",
  async (status) => {
    api.getById.mockResolvedValue({
      ...invoice,
      status,
      notes: null,
      lateFee: 0,
      adjustments: 0,
      amountPaid: invoice.total,
    });
    mockNavigation.pay = "mercadopago";
    render(<InvoiceDetailPage />);
    await screen.findByText("FAC-1");
    expect(
      screen.queryByRole("button", { name: "payMercadoPago" }),
    ).not.toBeInTheDocument();
    expect(gateway.createPreference).not.toHaveBeenCalled();
    expect(screen.queryByText("adjustments")).not.toBeInTheDocument();
    expect(screen.queryByText("lateFee")).not.toBeInTheDocument();
  },
);
it.each(["pending", "sent", "partial", "overdue"] as const)(
  "offers checkout for %s invoices",
  async (status) => {
    api.getById.mockResolvedValue({ ...invoice, status });
    render(<InvoiceDetailPage />);
    await screen.findByText("FAC-1");
    expect(
      screen.getByRole("button", { name: "payMercadoPago" }),
    ).toBeEnabled();
    expect(gateway.createPreference).not.toHaveBeenCalled();
  },
);
it("keeps checkout disabled until the preference resolves and redirects to its URL", async () => {
  let finish!: (value: {
    initPoint: string;
    sandboxInitPoint: string;
    transactionId: string;
  }) => void;
  gateway.createPreference.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<InvoiceDetailPage />);
  await screen.findByText("FAC-1");
  fireEvent.click(screen.getByRole("button", { name: "payMercadoPago" }));
  expect(screen.getByRole("button", { name: "loading" })).toBeDisabled();
  expect(gateway.createPreference).toHaveBeenCalledTimes(1);
  await act(async () =>
    finish({
      initPoint: "#checkout",
      sandboxInitPoint: "#sandbox",
      transactionId: "transaction",
    }),
  );
  expect(window.location.hash).toBe("#checkout");
});
it("automatically starts requested checkout once and exposes a failed preference", async () => {
  mockNavigation.pay = "mercadopago";
  gateway.createPreference.mockRejectedValueOnce(new Error("unavailable"));
  const view = render(<InvoiceDetailPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("uncertain");
  view.rerender(<InvoiceDetailPage />);
  expect(gateway.createPreference).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "payMercadoPago" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "recover" })).toBeEnabled();
});
it("remounts the scoped invoice document when the actor changes", async () => {
  const view = render(<InvoiceDetailPage />);
  await screen.findByText("FAC-1");
  mockAuth.user = { id: "other", companyId: "other-company", role: "admin" };
  view.rerender(<InvoiceDetailPage />);
  await waitFor(() =>
    expect(screen.getByTestId("document")).toHaveTextContent(
      "invoice:other-company:other",
    ),
  );
  expect(api.getById).toHaveBeenCalledTimes(2);
});
it.each(["missing", "denied", "no-id"])(
  "renders unavailable invoice after %s without exposing details",
  async (reason) => {
    if (reason === "no-id") mockNavigation.id = undefined;
    else if (reason === "denied")
      api.getById.mockRejectedValue(new Error("Forbidden"));
    else api.getById.mockResolvedValue(null);
    render(<InvoiceDetailPage />);
    if (reason === "denied") {
      expect(await screen.findByRole("alert")).toHaveTextContent("readError");
      expect(screen.getByRole("button", { name: "retry" })).toBeInTheDocument();
      return;
    }
    await screen.findByText("notFound");
    expect(screen.queryByTestId("document")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "backToInvoices" }),
    ).toHaveAttribute("href", "/es/invoices");
    if (reason === "no-id") expect(api.getById).not.toHaveBeenCalled();
  },
);
