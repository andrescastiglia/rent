import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TenantDetailPage from "./page";
import ActivityPage from "./activities/new/page";
import { tenantsApi } from "@/lib/api/tenants";
import { invoicesApi, paymentsApi } from "@/lib/api/payments";
import { whatsappApi } from "@/lib/api/whatsapp";
import type { User } from "@/types/auth";

let mockLoading = false;
let mockId: string | string[] = "tenant";
let mockUser: User = {
  id: "admin",
  role: "admin",
  firstName: "A",
  lastName: "B",
  email: null,
};
const mockPush = jest.fn(),
  mockRefresh = jest.fn();
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es-AR",
}));
jest.mock("next/navigation", () => ({ useParams: () => ({ id: mockId }) }));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: mockLoading, user: mockUser, token: "token" }),
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));
jest.mock("@/lib/api", () => ({ IS_MOCK_MODE: false }));
jest.mock("@/lib/api/tenants", () => ({
  tenantsApi: {
    getById: jest.fn(),
    getAll: jest.fn(),
    getLeaseHistory: jest.fn(),
    getActivities: jest.fn(),
    updateActivity: jest.fn(),
    createActivity: jest.fn(),
  },
}));
jest.mock("@/lib/api/payments", () => ({
  paymentsApi: { getAll: jest.fn(), downloadReceiptPdf: jest.fn() },
  invoicesApi: { getAll: jest.fn(), downloadPdf: jest.fn() },
}));
jest.mock("@/lib/api/whatsapp", () => ({
  whatsappApi: { createActivity: jest.fn() },
}));
const tenantApi = jest.mocked(tenantsApi),
  paymentApi = jest.mocked(paymentsApi),
  invoiceApi = jest.mocked(invoicesApi),
  messageApi = jest.mocked(whatsappApi);
const tenant = {
  id: "tenant",
  firstName: "Ana",
  lastName: "Pérez",
  dni: "12345678",
  phone: "112233",
  status: "ACTIVE",
};
const lease = {
  id: "lease",
  status: "ACTIVE",
  startDate: "2026-10-02T00:00:00Z",
  endDate: "2027-10-01",
  property: { name: "Casa Centro" },
};
const task = {
  id: "task",
  type: "task",
  status: "pending",
  subject: "Inspección",
  body: "Revisar",
  dueAt: "2026-10-04T15:00:00Z",
  createdAt: "2026-10-01",
};
const payment = {
  id: "payment",
  invoiceId: "invoice",
  amount: 1250.25,
  currencyCode: "USD",
  paymentDate: "2026-10-02T00:00:00Z",
  createdAt: "2026-10-02",
  method: "cash",
  status: "completed",
  receipt: { receiptNumber: "REC-1", pdfUrl: "db://receipt" },
};
const invoice = {
  id: "invoice",
  invoiceNumber: "FAC-1",
  arcaTipoComprobante: "factura_c",
};
const page = <T,>(data: T[], number = 1, total = data.length, limit = 100) => ({
  data,
  page: number,
  total,
  limit,
});
beforeEach(() => {
  jest.clearAllMocks();
  mockId = "tenant";
  mockLoading = false;
  mockUser = {
    id: "admin",
    role: "admin",
    firstName: "A",
    lastName: "B",
    email: null,
  };
  tenantApi.getById.mockResolvedValue(tenant as never);
  tenantApi.getAll.mockResolvedValue([{ ...tenant, id: "unrelated" }] as never);
  tenantApi.getLeaseHistory.mockResolvedValue([lease] as never);
  tenantApi.getActivities.mockResolvedValue([task] as never);
  tenantApi.updateActivity.mockResolvedValue({
    ...task,
    status: "completed",
  } as never);
  tenantApi.createActivity.mockResolvedValue(task as never);
  messageApi.createActivity.mockResolvedValue(task as never);
  paymentApi.getAll.mockResolvedValue(page([payment]) as never);
  invoiceApi.getAll.mockResolvedValue(page([invoice]) as never);
  paymentApi.downloadReceiptPdf.mockResolvedValue(undefined);
  invoiceApi.downloadPdf.mockResolvedValue(undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(window, "alert").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
const mount = async () => {
  const view = render(<TenantDetailPage />);
  await screen.findByRole("heading", { name: "Ana Pérez" });
  return view;
};

it.each([TenantDetailPage, ActivityPage])(
  "never displays an unrelated tenant when the requested identity is missing",
  async (Page) => {
    tenantApi.getById.mockResolvedValueOnce(null);
    render(<Page />);
    await screen.findByText("notFound");
    expect(tenantApi.getAll).not.toHaveBeenCalled();
    expect(tenantApi.getLeaseHistory).not.toHaveBeenCalled();
    expect(screen.queryByText("Ana Pérez")).not.toBeInTheDocument();
  },
);

it("waits for authentication, normalizes a route array, and preserves calendar dates", async () => {
  mockLoading = true;
  mockId = ["tenant", "ignored"];
  const view = render(<TenantDetailPage />);
  expect(tenantApi.getById).not.toHaveBeenCalled();
  mockLoading = false;
  view.rerender(<TenantDetailPage />);
  await screen.findByText("Ana Pérez");
  expect(tenantApi.getById).toHaveBeenCalledWith("tenant");
  expect(screen.getByText("leaseStart").nextElementSibling).toHaveTextContent(
    "2/10/2026",
  );
  expect(screen.getByRole("link", { name: "edit" })).toHaveAttribute(
    "href",
    "/es-AR/tenants/tenant/edit",
  );
});

it("reads later payment and invoice pages so documents beyond one hundred records remain reachable", async () => {
  paymentApi.getAll.mockImplementation(
    async (filters) =>
      page<unknown>(
        filters?.page === 1
          ? [payment]
          : [{ ...payment, id: "later", invoiceId: "debit", receipt: null }],
        filters?.page,
        2,
        1,
      ) as never,
  );
  invoiceApi.getAll.mockImplementation(
    async (filters) =>
      page(
        filters?.page === 1
          ? [invoice]
          : [
              {
                ...invoice,
                id: "debit",
                invoiceNumber: "DEB-1",
                arcaTipoComprobante: "nota_debito_c",
              },
            ],
        filters?.page,
        2,
        1,
      ) as never,
  );
  await mount();
  expect(paymentApi.getAll).toHaveBeenCalledWith({
    tenantId: "tenant",
    page: 2,
    limit: 100,
  });
  expect(invoiceApi.getAll).toHaveBeenCalledWith({
    leaseId: "lease",
    page: 2,
    limit: 100,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "documents.downloadDebitNote" }),
  );
  await waitFor(() =>
    expect(invoiceApi.downloadPdf).toHaveBeenCalledWith(
      "debit",
      "DEB-1",
      "nota-debito",
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "documents.downloadInvoice" }),
  );
  await waitFor(() =>
    expect(invoiceApi.downloadPdf).toHaveBeenCalledWith(
      "invoice",
      "FAC-1",
      "factura",
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "documents.downloadReceipt" }),
  );
  await waitFor(() =>
    expect(paymentApi.downloadReceiptPdf).toHaveBeenCalledWith(
      "payment",
      "REC-1",
    ),
  );
});

it("completes only the selected pending activity and displays the new status", async () => {
  tenantApi.getActivities.mockResolvedValue([
    task,
    {
      ...task,
      id: "past",
      status: "cancelled",
      subject: "Cancelada",
      dueAt: null,
    },
  ] as never);
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "activities.complete" }));
  await screen.findByText(/activityStatus.completed/);
  expect(tenantApi.updateActivity).toHaveBeenCalledWith(
    "tenant",
    "task",
    expect.objectContaining({ status: "completed" }),
  );
  expect(screen.getByText("Cancelada")).toBeInTheDocument();
});

it("keeps external readers out of tenant mutations and financial backoffice reads", async () => {
  mockUser = { ...mockUser, role: "owner" };
  await mount();
  expect(screen.queryByRole("link", { name: "edit" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "activities.complete" }),
  ).not.toBeInTheDocument();
  expect(paymentApi.getAll).not.toHaveBeenCalled();
  expect(invoiceApi.getAll).not.toHaveBeenCalled();
});

it("shows partial read failures with explicit retry while preserving the requested person", async () => {
  tenantApi.getActivities.mockRejectedValueOnce(new Error("offline"));
  invoiceApi.getAll.mockRejectedValueOnce(new Error("offline"));
  paymentApi.getAll.mockRejectedValueOnce(new Error("offline"));
  await mount();
  expect(screen.getByRole("alert")).toHaveTextContent("error");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("Inspección");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(tenantApi.getById).toHaveBeenCalledTimes(2);
});

it("displays genuine empty data and does not offer a receipt before the document exists", async () => {
  tenantApi.getLeaseHistory.mockResolvedValue([]);
  tenantApi.getActivities.mockResolvedValue([]);
  paymentApi.getAll.mockResolvedValue(
    page([{ ...payment, invoiceId: null, receipt: null }]) as never,
  );
  await mount();
  expect(screen.getByText("noActiveLeases")).toBeInTheDocument();
  expect(screen.getByText("activities.empty")).toBeInTheDocument();
  expect(screen.getByText("documents.noDocuments")).toBeInTheDocument();
});

it.each(["receipt", "invoice", "activity"])(
  "surfaces a failed %s operation without an automatic retry",
  async (operation) => {
    if (operation === "receipt")
      paymentApi.downloadReceiptPdf.mockRejectedValueOnce(new Error("offline"));
    if (operation === "invoice")
      invoiceApi.downloadPdf.mockRejectedValueOnce(new Error("offline"));
    if (operation === "activity")
      tenantApi.updateActivity.mockRejectedValueOnce(new Error("offline"));
    await mount();
    fireEvent.click(
      screen.getByRole("button", {
        name:
          operation === "activity"
            ? "activities.complete"
            : `documents.download${operation === "receipt" ? "Receipt" : "Invoice"}`,
      }),
    );
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("error"));
  },
);

const mountActivity = async () => {
  const view = render(<ActivityPage />);
  await screen.findByLabelText("activities.subject");
  return view;
};
const fillActivity = () => {
  fireEvent.change(screen.getByLabelText("activities.subject"), {
    target: { value: " Visitar " },
  });
  fireEvent.change(screen.getByLabelText("activities.body"), {
    target: { value: " Revisar estado " },
  });
};

it("creates a dated tenant activity with trimmed fields and returns to the original context", async () => {
  const { container } = await mountActivity();
  fillActivity();
  fireEvent.change(screen.getByLabelText("activities.dueAt"), {
    target: { value: "2026-10-03T15:30" },
  });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith("/tenants/tenant#activities"),
  );
  expect(tenantApi.createActivity).toHaveBeenCalledWith("tenant", {
    type: "task",
    subject: "Visitar",
    body: "Revisar estado",
    dueAt: "2026-10-03T15:30",
  });
  expect(mockRefresh).toHaveBeenCalled();
});

it("validates required activity subjects and missing WhatsApp recipients", async () => {
  tenantApi.getById.mockResolvedValue({ ...tenant, phone: "" } as never);
  const { container } = await mountActivity();
  fireEvent.submit(container.querySelector("form")!);
  expect(window.alert).toHaveBeenCalledWith("errors.activitySubjectRequired");
  fillActivity();
  fireEvent.change(screen.getByLabelText("activities.type"), {
    target: { value: "whatsapp" },
  });
  fireEvent.submit(container.querySelector("form")!);
  expect(window.alert).toHaveBeenCalledWith("errors.phoneRequired");
  expect(messageApi.createActivity).not.toHaveBeenCalled();
});

it("sends WhatsApp through the consent-aware workflow and retains data after an error", async () => {
  messageApi.createActivity.mockRejectedValueOnce(new Error("offline"));
  const { container } = await mountActivity();
  fillActivity();
  fireEvent.change(screen.getByLabelText("activities.type"), {
    target: { value: "whatsapp" },
  });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith("error"));
  expect(screen.getByLabelText("activities.subject")).toHaveValue(" Visitar ");
  expect(tenantApi.createActivity).not.toHaveBeenCalled();
  expect(messageApi.createActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      personType: "tenant",
      personId: "tenant",
      subject: "Visitar",
      requestId: expect.any(String),
    }),
  );
});

it("blocks staff activity mutations when the tenant module has not been granted", async () => {
  mockUser = { ...mockUser, role: "staff", permissions: { tenants: false } };
  render(<ActivityPage />);
  await screen.findByText("notFound");
  expect(
    screen.queryByRole("button", { name: "activities.add" }),
  ).not.toBeInTheDocument();
});
