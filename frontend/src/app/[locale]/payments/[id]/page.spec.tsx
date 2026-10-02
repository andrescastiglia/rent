import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Payment, Invoice, CreditNote } from "@/types/payment";
import type { User } from "@/types/auth";
import PaymentDetailPage from "./page";
import { paymentsApi, invoicesApi } from "@/lib/api/payments";
import { ApiRequestError } from "@/lib/api";
const mockAuth: { loading: boolean; user: User | null } = {
  loading: false,
  user: { id: "admin", companyId: "company", role: "admin" } as User,
};
const mockNavigation: { id?: string | string[] } = { id: "payment" };
const mockT = (key: string) => key;
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("next/navigation", () => ({ useParams: () => mockNavigation }));
jest.mock("next-intl", () => ({
  useTranslations: () => mockT,
  useLocale: () => "es",
}));
jest.mock("@/lib/api/payments", () => ({
  paymentsApi: {
    getById: jest.fn(),
    confirm: jest.fn(),
    update: jest.fn(),
    downloadReceiptPdf: jest.fn(),
  },
  invoicesApi: {
    getById: jest.fn(),
    listCreditNotes: jest.fn(),
    downloadPdf: jest.fn(),
    downloadCreditNotePdf: jest.fn(),
  },
}));
jest.mock("@/components/payments/PaymentRefunds", () => ({
  __esModule: true,
  default: ({
    payment,
    onChanged,
  }: {
    payment: Payment;
    onChanged: () => void;
  }) => <button onClick={onChanged}>Refunds for {payment.id}</button>,
}));
const api = jest.mocked(paymentsApi),
  invoices = jest.mocked(invoicesApi);
const payment: Payment = {
  id: "payment",
  tenantAccountId: "account",
  invoiceId: "invoice",
  amount: 1234.56,
  currencyCode: "ARS",
  paymentDate: "2026-10-01",
  method: "bank_transfer",
  activityType: "monthly",
  status: "completed",
  reference: "Transferencia 123",
  notes: "Octubre",
  items: [
    {
      id: "item",
      paymentId: "payment",
      description: "Alquiler",
      amount: 600,
      quantity: 2,
      type: "charge",
    },
    {
      id: "discount",
      paymentId: "payment",
      description: "Bonificación",
      amount: 10,
      quantity: 1,
      type: "discount",
    },
  ],
  receipt: {
    id: "receipt",
    paymentId: "payment",
    receiptNumber: "REC-1",
    amount: 1234.56,
    currencyCode: "ARS",
    pdfUrl: "/receipt.pdf",
    issuedAt: "2026-10-01",
  },
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
};
const invoice = { id: "invoice", invoiceNumber: "FAC-1" } as Invoice;
const note = {
  id: "note",
  noteNumber: "NC-1",
  paymentId: "payment",
  pdfUrl: "/note.pdf",
} as CreditNote;
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.loading = false;
  mockAuth.user = { id: "admin", companyId: "company", role: "admin" } as User;
  mockNavigation.id = "payment";
  api.getById.mockResolvedValue(payment);
  api.confirm.mockResolvedValue(payment);
  api.update.mockResolvedValue(payment);
  api.downloadReceiptPdf.mockResolvedValue(undefined);
  invoices.getById.mockResolvedValue(invoice);
  invoices.listCreditNotes.mockResolvedValue([
    note,
    { ...note, id: "other", paymentId: "different" },
  ]);
  invoices.downloadPdf.mockResolvedValue(undefined);
  invoices.downloadCreditNotePdf.mockResolvedValue(undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
async function ready() {
  render(<PaymentDetailPage />);
  await screen.findByRole("heading", { name: "paymentDetails" });
}
it("waits for authentication and hides records when unauthenticated", () => {
  mockAuth.loading = true;
  const view = render(<PaymentDetailPage />);
  expect(api.getById).not.toHaveBeenCalled();
  mockAuth.loading = false;
  mockAuth.user = null;
  view.rerender(<PaymentDetailPage />);
  expect(view.container).toBeEmptyDOMElement();
});
it("renders cents, line item discounts and only credit notes for the selected payment", async () => {
  mockNavigation.id = ["payment"];
  await ready();
  expect(api.getById).toHaveBeenCalledWith("payment");
  expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  expect(screen.getByText(/-.*10,00/)).toBeInTheDocument();
  expect(screen.getByText("activityTypes.monthly")).toBeInTheDocument();
  expect(screen.getByText("Transferencia 123")).toBeInTheDocument();
  expect(screen.getByText("Octubre")).toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "actions.downloadCreditNote" }),
  ).toHaveLength(1);
  expect(
    screen.getByRole("link", { name: "actions.viewInvoice" }),
  ).toHaveAttribute("href", "/es/invoices/invoice");
});
it.each(["missing", "no-id"])(
  "renders %s without invented receipt or invoice data",
  async (kind) => {
    if (kind === "no-id") mockNavigation.id = undefined;
    else api.getById.mockResolvedValue(null);
    render(<PaymentDetailPage />);
    await screen.findByText("notFound");
    expect(invoices.getById).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "backToPayments" }),
    ).toHaveAttribute("href", "/es/payments");
  },
);
it("shows a read error and recovers with a new explicit read", async () => {
  api.getById.mockRejectedValueOnce(new Error("offline"));
  render(<PaymentDetailPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("readError");
  expect(screen.queryByText("notFound")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByRole("heading", { name: "paymentDetails" });
  expect(api.getById).toHaveBeenCalledTimes(2);
});
it("retains the payment while invoice evidence is unavailable and retries on refund changes", async () => {
  invoices.getById.mockRejectedValueOnce(new Error("invoice offline"));
  await ready();
  expect(screen.getByRole("alert")).toHaveTextContent("readError");
  fireEvent.click(screen.getByRole("button", { name: "Refunds for payment" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(api.getById).toHaveBeenCalledTimes(2);
  expect(
    screen.getByRole("button", { name: "actions.downloadInvoice" }),
  ).toBeInTheDocument();
});
it("does not load unrelated documents for unlinked payments or offer absent PDFs", async () => {
  api.getById.mockResolvedValue({
    ...payment,
    invoiceId: null,
    receipt: { ...payment.receipt!, pdfUrl: null },
  });
  await ready();
  expect(invoices.getById).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "actions.downloadInvoice" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "receiptPreparingDescription" }),
  ).toBeDisabled();
});
it.each(["receipt", "invoice", "credit"])(
  "disables the %s document download until it completes",
  async (kind) => {
    let finish!: () => void;
    const fn =
      kind === "receipt"
        ? api.downloadReceiptPdf
        : kind === "invoice"
          ? invoices.downloadPdf
          : invoices.downloadCreditNotePdf;
    fn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await ready();
    const name =
      kind === "receipt"
        ? "actions.downloadReceipt"
        : kind === "invoice"
          ? "actions.downloadInvoice"
          : "actions.downloadCreditNote";
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: "loading" })).toBeDisabled();
    expect(fn).toHaveBeenCalledWith(
      ...(kind === "receipt"
        ? ["payment", "REC-1"]
        : kind === "invoice"
          ? ["invoice", "FAC-1"]
          : ["note", "NC-1"]),
    );
    await act(async () => finish());
    expect(screen.getByRole("button", { name })).toBeEnabled();
  },
);
it.each(["receipt", "invoice", "credit"])(
  "shows the %s download failure without clearing payment details",
  async (kind) => {
    const fn =
      kind === "receipt"
        ? api.downloadReceiptPdf
        : kind === "invoice"
          ? invoices.downloadPdf
          : invoices.downloadCreditNotePdf;
    fn.mockRejectedValueOnce(new Error("no PDF"));
    await ready();
    const name =
      kind === "receipt"
        ? "actions.downloadReceipt"
        : kind === "invoice"
          ? "actions.downloadInvoice"
          : "actions.downloadCreditNote";
    fireEvent.click(screen.getByRole("button", { name }));
    expect(await screen.findByRole("alert")).toHaveTextContent("documentError");
    expect(
      screen.getByRole("heading", { name: "paymentDetails" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name })).toBeEnabled();
  },
);
it("blocks unprepared credit note PDFs while allowing prepared receipt downloads", async () => {
  invoices.listCreditNotes.mockResolvedValue([{ ...note, pdfUrl: null }]);
  await ready();
  expect(
    screen.getByRole("button", { name: "actions.downloadCreditNote" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "actions.downloadReceipt" }),
  ).toBeEnabled();
});
it.each(["tenant", "owner", "buyer", "staff"] as const)(
  "does not offer administrative draft mutations to %s without module permission",
  async (role) => {
    mockAuth.user = {
      id: "person",
      companyId: "company",
      role,
      permissions: { payments: false },
    } as User;
    api.getById.mockResolvedValue({
      ...payment,
      status: "pending",
      receipt: undefined,
    });
    await ready();
    expect(
      screen.queryByRole("button", { name: "edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "confirmPayment" }),
    ).not.toBeInTheDocument();
  },
);
it("reviews the pending payment before confirmation and locks the request in flight", async () => {
  api.getById.mockResolvedValue({
    ...payment,
    status: "pending",
    receipt: undefined,
  });
  let finish!: (value: Payment) => void;
  api.confirm.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "confirmPayment" }));
  expect(api.confirm).not.toHaveBeenCalled();
  expect(screen.getByRole("region", { name: "review" })).toHaveTextContent(
    "impact",
  );
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  expect(screen.getByRole("button", { name: "confirm" })).toBeDisabled();
  expect(api.confirm).toHaveBeenCalledWith("payment");
  await act(async () => finish(payment));
  expect(
    screen.queryByRole("region", { name: "review" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "actions.downloadReceipt" }),
  ).toBeEnabled();
});
it("preserves an uncertain confirmation and requires explicit recovery without automatic resubmission", async () => {
  api.getById.mockResolvedValue({
    ...payment,
    status: "pending",
    receipt: undefined,
  });
  api.confirm.mockRejectedValueOnce(new Error("lost response"));
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "confirmPayment" }));
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("uncertain");
  expect(api.confirm).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(api.confirm.mock.calls).toEqual([["payment"], ["payment"]]);
});
it("leaves a rejected confirmation available for review and cancellation", async () => {
  api.getById.mockResolvedValue({
    ...payment,
    status: "pending",
    receipt: undefined,
  });
  api.confirm.mockRejectedValueOnce(new ApiRequestError(403, "Forbidden"));
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "confirmPayment" }));
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("rejected");
  expect(
    screen.queryByRole("button", { name: "recover" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(
    screen.queryByRole("region", { name: "review" }),
  ).not.toBeInTheDocument();
});
it("edits all draft fields and line item details while retaining item identities", async () => {
  api.getById.mockResolvedValue({
    ...payment,
    status: "pending",
    receipt: undefined,
  });
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "edit" }));
  fireEvent.change(screen.getByLabelText("date"), {
    target: { value: "2026-10-03" },
  });
  fireEvent.change(screen.getByLabelText("method.label"), {
    target: { value: "cash" },
  });
  fireEvent.change(screen.getByLabelText("activityLabel"), {
    target: { value: "annual" },
  });
  fireEvent.change(screen.getByLabelText("reference"), {
    target: { value: "Caja" },
  });
  fireEvent.change(screen.getByLabelText("notes"), {
    target: { value: "Nota nueva" },
  });
  fireEvent.change(screen.getByDisplayValue("Alquiler"), {
    target: { value: "Canon" },
  });
  const numbers = screen.getAllByRole("spinbutton");
  fireEvent.change(numbers[0], { target: { value: "500.25" } });
  fireEvent.change(numbers[1], { target: { value: "3" } });
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[1], { target: { value: "discount" } });
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith("payment", {
      paymentDate: "2026-10-03",
      method: "cash",
      activityType: "annual",
      reference: "Caja",
      notes: "Nota nueva",
      items: [
        {
          itemId: "item",
          description: "Canon",
          amount: 500.25,
          quantity: 3,
          type: "discount",
        },
        {
          itemId: "discount",
          description: "Bonificación",
          amount: 10,
          quantity: 1,
          type: "discount",
        },
      ],
    }),
  );
  expect(
    screen.queryByRole("button", { name: "save" }),
  ).not.toBeInTheDocument();
});
it("preserves the original uncertain edit and prevents changed fields or cancelling it", async () => {
  api.getById.mockResolvedValue({
    ...payment,
    status: "pending",
    receipt: undefined,
    items: undefined,
    reference: null,
    notes: null,
  });
  api.update.mockRejectedValueOnce(new Error("lost response"));
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "edit" }));
  expect(screen.getByText("items.empty")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("notes"), {
    target: { value: "Original" },
  });
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("notes")).toBeDisabled();
  expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
  expect(api.update).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
  expect(api.update.mock.calls[0]).toEqual(api.update.mock.calls[1]);
});
it("cancels unsaved changes and defaults historical item quantity and type", async () => {
  api.getById.mockResolvedValue({
    ...payment,
    status: "pending",
    receipt: undefined,
    items: [
      { ...payment.items![0], quantity: undefined, type: undefined },
    ] as never,
  });
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "edit" }));
  expect(screen.getAllByRole("spinbutton")[1]).toHaveValue(1);
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(api.update).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "edit" })).toBeEnabled();
});
it("polls completed receipts until ready and stops updates after unmount", async () => {
  jest.useFakeTimers();
  api.getById
    .mockResolvedValueOnce({ ...payment, invoiceId: null, receipt: undefined })
    .mockRejectedValueOnce(new Error("poll offline"))
    .mockResolvedValueOnce({ ...payment, invoiceId: null });
  const view = render(<PaymentDetailPage />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText("noReceipt")).toBeInTheDocument();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000);
  });
  expect(api.getById).toHaveBeenCalledTimes(2);
  expect(screen.getByText("noReceipt")).toBeInTheDocument();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000);
  });
  expect(
    screen.getByRole("button", { name: "actions.downloadReceipt" }),
  ).toBeEnabled();
  view.unmount();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10000);
  });
  expect(api.getById).toHaveBeenCalledTimes(3);
});
