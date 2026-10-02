import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import InvoicesPage from "./page";
import { invoicesApi } from "@/lib/api/payments";

const mockAuth = { loading: false };
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/lib/api/payments", () => ({
  invoicesApi: { getAll: jest.fn(), downloadPdf: jest.fn() },
}));
const api = jest.mocked(invoicesApi);
const invoice = {
  id: "invoice",
  invoiceNumber: "FAC-1",
  leaseId: "lease",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  dueDate: "2026-10-10",
  total: 1234.56,
  amountPaid: 100,
  lateFee: 10,
  currencyCode: "ARS",
  status: "partial",
  pdfUrl: "/invoice.pdf",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.loading = false;
  api.getAll.mockResolvedValue({
    data: [invoice],
    total: 25,
    page: 1,
    limit: 20,
  } as never);
  api.downloadPdf.mockResolvedValue(undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("waits for authentication before reading invoices", async () => {
  mockAuth.loading = true;
  const { rerender } = render(<InvoicesPage />);
  expect(api.getAll).not.toHaveBeenCalled();
  expect(screen.getByText("loading")).toBeInTheDocument();
  mockAuth.loading = false;
  rerender(<InvoicesPage />);
  await screen.findByText("FAC-1");
  expect(api.getAll).toHaveBeenCalledWith({
    page: 1,
    limit: 20,
    search: undefined,
  });
});
it("renders server totals, cents, civil dates and invoice links across pages", async () => {
  render(<InvoicesPage />);
  await screen.findByText("FAC-1");
  expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  expect(screen.getByText(/1\/10\/2026.*31\/10\/2026/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "view" })).toHaveAttribute(
    "href",
    "/es/invoices/invoice",
  );
  api.getAll.mockResolvedValueOnce({
    data: [{ ...invoice, id: "second", invoiceNumber: "FAC-2" }],
    total: 25,
    page: 2,
    limit: 20,
  } as never);
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await screen.findByText("FAC-2");
  expect(api.getAll).toHaveBeenLastCalledWith({
    page: 2,
    limit: 20,
    search: undefined,
  });
  fireEvent.change(screen.getByLabelText("allStatuses"), {
    target: { value: "cancelled" },
  });
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      search: undefined,
      status: "cancelled",
    }),
  );
  fireEvent.change(screen.getByLabelText("allStatuses"), {
    target: { value: "" },
  });
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      search: undefined,
    }),
  );
});
it("debounces search on the server and resets pagination", async () => {
  jest.useFakeTimers();
  render(<InvoicesPage />);
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await act(async () => {
    await Promise.resolve();
  });
  const reads = api.getAll.mock.calls.length;
  fireEvent.change(screen.getByLabelText("searchPlaceholder"), {
    target: { value: "Ana" },
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(299);
  });
  expect(api.getAll).not.toHaveBeenCalledWith(
    expect.objectContaining({ search: "Ana" }),
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
  expect(api.getAll).toHaveBeenLastCalledWith({
    page: 1,
    limit: 20,
    search: "Ana",
  });
  expect(api.getAll.mock.calls.length).toBeGreaterThan(reads);
});
it("distinguishes an empty result from a failed request and allows retry", async () => {
  api.getAll
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
  render(<InvoicesPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("error");
  expect(screen.queryByText("noInvoices")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("noInvoices");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(api.getAll).toHaveBeenCalledTimes(2);
});
it.each(["paid", "overdue"])(
  "renders %s without fabricating partial payment amounts or a missing PDF",
  async (status) => {
    api.getAll.mockResolvedValue({
      data: [{ ...invoice, status, lateFee: 0, pdfUrl: null }],
      total: 1,
      page: 1,
      limit: 20,
    } as never);
    render(<InvoicesPage />);
    await screen.findByText("FAC-1");
    expect(
      screen.queryByRole("button", { name: "actions.downloadInvoice" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^paid:/)).not.toBeInTheDocument();
  },
);
it("downloads the selected invoice once while pending, then permits another download", async () => {
  let finish!: () => void;
  api.downloadPdf.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<InvoicesPage />);
  await screen.findByText("FAC-1");
  fireEvent.click(
    screen.getByRole("button", { name: "actions.downloadInvoice" }),
  );
  expect(screen.getByRole("button", { name: "loading" })).toBeDisabled();
  expect(api.downloadPdf).toHaveBeenCalledWith("invoice", "FAC-1");
  await act(async () => finish());
  expect(
    screen.getByRole("button", { name: "actions.downloadInvoice" }),
  ).toBeEnabled();
});
it("retains invoice data after PDF download failure", async () => {
  api.downloadPdf.mockRejectedValueOnce(new Error("PDF unavailable"));
  render(<InvoicesPage />);
  await screen.findByText("FAC-1");
  fireEvent.click(
    screen.getByRole("button", { name: "actions.downloadInvoice" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "actions.downloadInvoice" }),
    ).toBeEnabled(),
  );
  expect(screen.getByText("FAC-1")).toBeInTheDocument();
  expect(console.error).toHaveBeenCalledWith(
    "Failed to download invoice from list",
    expect.any(Error),
  );
});
