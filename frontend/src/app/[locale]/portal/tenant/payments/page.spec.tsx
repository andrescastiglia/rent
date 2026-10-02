import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import TenantPaymentsPage from "./page";
import { invoicesApi, paymentsApi } from "@/lib/api/payments";
import { paymentGatewayApi } from "@/lib/api/payment-gateway";
import { ApiRequestError } from "@/lib/api";
jest.mock("next-intl", () => ({
  useLocale: () => "es-AR",
  useTranslations: () => (key: string) => key,
}));
jest.mock("@/lib/api/payments", () => ({
  invoicesApi: { getAll: jest.fn() },
  paymentsApi: { getAll: jest.fn() },
}));
jest.mock("@/lib/api/payment-gateway", () => ({
  paymentGatewayApi: { createPreference: jest.fn() },
}));
const invoiceApi = jest.mocked(invoicesApi),
  paymentApi = jest.mocked(paymentsApi),
  gateway = jest.mocked(paymentGatewayApi);
const invoice = {
  id: "invoice",
  invoiceNumber: "FAC-1",
  total: 100.75,
  amountPaid: 40.25,
  balanceDue: 60.5,
  currencyCode: "USD",
  dueDate: "2026-10-03T00:00:00Z",
  status: "partial",
};
const preference = {
  initPoint: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref",
  sandboxInitPoint: "",
  transactionId: "transaction",
};
beforeEach(() => {
  jest.clearAllMocks();
  invoiceApi.getAll.mockResolvedValue({
    data: [invoice],
    page: 1,
    limit: 20,
    total: 25,
  } as never);
  paymentApi.getAll.mockResolvedValue({
    data: [
      {
        id: "payment",
        amount: 40.25,
        currencyCode: "USD",
        paymentDate: "2026-10-02",
        status: "completed",
        reference: "TRANSFER-1",
      },
    ],
    page: 1,
    limit: 20,
    total: 25,
  } as never);
  gateway.createPreference.mockResolvedValue(preference);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const mount = async () => {
  const view = render(<TenantPaymentsPage />);
  await screen.findByText("FAC-1");
  return view;
};
const review = () =>
  fireEvent.click(screen.getByRole("button", { name: "pay FAC-1" }));
const confirm = () =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "checkout.confirm",
    }),
  );

it("shows pending balances and each payment currency, keeping the server pages independent", async () => {
  await mount();
  expect(screen.getByText(/TRANSFER-1/)).toBeInTheDocument();
  const invoices = screen.getByRole("region", { name: "invoiceHistory" });
  const payments = screen.getByRole("region", { name: "recentPayments" });
  expect(invoices).toHaveTextContent("60,50");
  expect(payments).toHaveTextContent("40,25");
  fireEvent.click(within(invoices).getByRole("button", { name: "next" }));
  await waitFor(() =>
    expect(invoiceApi.getAll).toHaveBeenLastCalledWith({ page: 2, limit: 20 }),
  );
  await screen.findByText("FAC-1");
  fireEvent.click(
    within(screen.getByRole("region", { name: "recentPayments" })).getByRole(
      "button",
      { name: "next" },
    ),
  );
  await waitFor(() =>
    expect(paymentApi.getAll).toHaveBeenLastCalledWith({ page: 2, limit: 20 }),
  );
});

it("requires an explicit balance review before requesting a checkout and displays the approved destination", async () => {
  await mount();
  review();
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveTextContent("FAC-1");
  expect(dialog).toHaveTextContent("60,50");
  expect(gateway.createPreference).not.toHaveBeenCalled();
  confirm();
  await screen.findByText("checkout.ready");
  expect(gateway.createPreference).toHaveBeenCalledWith("invoice");
  expect(
    screen.getByRole("link", { name: "checkout.continue" }),
  ).toHaveAttribute("href", preference.initPoint);
  fireEvent.click(within(dialog).getByRole("button", { name: "close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  review();
  expect(screen.queryByText("checkout.ready")).not.toBeInTheDocument();
});

it.each(["paid", "cancelled", "refunded", "draft"])(
  "does not offer a checkout for a %s invoice",
  async (status) => {
    invoiceApi.getAll.mockResolvedValueOnce({
      data: [{ ...invoice, status }],
      page: 1,
      limit: 20,
      total: 1,
    } as never);
    await mount();
    expect(
      screen.queryByRole("button", { name: "pay FAC-1" }),
    ).not.toBeInTheDocument();
  },
);

it("uses cent arithmetic when a historical invoice has no balanceDue and clamps overpayment to zero", async () => {
  invoiceApi.getAll.mockResolvedValueOnce({
    data: [
      { ...invoice, balanceDue: null },
      {
        ...invoice,
        id: "overpaid",
        invoiceNumber: "FAC-2",
        balanceDue: null,
        amountPaid: 200,
      },
      { ...invoice, id: "negative", invoiceNumber: "FAC-3", balanceDue: -5 },
    ],
    page: 1,
    limit: 20,
    total: 3,
  } as never);
  await mount();
  expect(screen.getByRole("button", { name: "pay FAC-1" })).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "pay FAC-2" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "pay FAC-3" }),
  ).not.toBeInTheDocument();
});

it("keeps a lost checkout request recoverable without an automatic resend or a different invoice", async () => {
  gateway.createPreference.mockRejectedValueOnce(new Error("lost response"));
  await mount();
  review();
  confirm();
  await screen.findByText("checkout.uncertain");
  expect(gateway.createPreference).toHaveBeenCalledTimes(1);
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "close" }),
  );
  expect(screen.getByRole("button", { name: "pay FAC-1" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("checkout.uncertain");
  fireEvent.click(screen.getByRole("button", { name: "checkout.recover" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "checkout.recover",
    }),
  );
  await screen.findByText("checkout.ready");
  expect(gateway.createPreference).toHaveBeenNthCalledWith(2, "invoice");
});

it("distinguishes a definitive rejection from an uncertain provider result", async () => {
  gateway.createPreference.mockRejectedValueOnce(
    new ApiRequestError(403, "No autorizado"),
  );
  await mount();
  review();
  confirm();
  await screen.findByText("checkout.rejected");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "close" }),
  );
  expect(screen.getByRole("button", { name: "pay FAC-1" })).toBeEnabled();
  expect(gateway.createPreference).toHaveBeenCalledTimes(1);
});

it.each([
  "http://mercadopago.com/checkout",
  "https://mercadopago.com.evil.example/checkout",
  "https://user:password@mercadopago.com/checkout",
  "javascript:alert(1)",
])("rejects an unsafe checkout URL %s", async (url) => {
  gateway.createPreference.mockResolvedValueOnce({
    ...preference,
    initPoint: url,
  });
  await mount();
  review();
  confirm();
  await screen.findByText("checkout.uncertain");
  expect(
    screen.queryByRole("link", { name: "checkout.continue" }),
  ).not.toBeInTheDocument();
});

it("prevents duplicate confirmation while the same preference is pending", async () => {
  let finish: ((value: typeof preference) => void) | undefined;
  gateway.createPreference.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  review();
  confirm();
  expect(
    within(screen.getByRole("dialog")).getByRole("button", { name: "close" }),
  ).toBeDisabled();
  expect(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "checkout.confirm",
    }),
  ).toBeDisabled();
  await act(async () => {
    finish?.(preference);
  });
  expect(gateway.createPreference).toHaveBeenCalledTimes(1);
});

it("shows failed reads with explicit recovery and successful empty histories separately", async () => {
  paymentApi.getAll.mockRejectedValueOnce(new Error("offline"));
  render(<TenantPaymentsPage />);
  await screen.findByRole("alert");
  expect(screen.queryByText("noPayments")).not.toBeInTheDocument();
  invoiceApi.getAll.mockResolvedValueOnce({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  paymentApi.getAll.mockResolvedValueOnce({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  });
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("noInvoices");
  expect(screen.getByText("noPayments")).toBeInTheDocument();
});

it("discards obsolete reads after the component unmounts", async () => {
  let finish:
    | ((value: Awaited<ReturnType<typeof invoicesApi.getAll>>) => void)
    | undefined;
  invoiceApi.getAll.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<TenantPaymentsPage />);
  view.unmount();
  await act(async () => {
    finish?.({ data: [], total: 0, page: 1, limit: 20 });
  });
  expect(screen.queryByText("noInvoices")).not.toBeInTheDocument();
});
