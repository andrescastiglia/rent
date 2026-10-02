import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import SaleDetailPanel from "./SaleDetailPanel";
import { salesApi } from "@/lib/api/sales";
import {
  completeDomainAttempt,
  prepareDomainAttempt,
} from "@/lib/domain-operation";
import type { SaleAgreement } from "@/types/sales";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "user", companyId: "company" },
  }),
}));
jest.mock("@/lib/domain-operation", () => ({
  prepareDomainAttempt: jest.fn(),
  completeDomainAttempt: jest.fn(),
}));
jest.mock("@/lib/api/sales", () => ({
  salesApi: {
    getReceipts: jest.fn(),
    getSchedule: jest.fn(),
    downloadReceiptPdf: jest.fn(),
    createReceipt: jest.fn(),
    cancelReceipt: jest.fn(),
  },
}));
const agreement = {
  id: "agreement",
  buyerName: "Comprador",
  currency: "ARS",
  totalAmount: 1000,
  paidAmount: 100,
  installmentAmount: 100,
  installmentCount: 10,
} as SaleAgreement;
const receipt = {
  id: "r1",
  receiptNumber: "SREC-1",
  amount: 100,
  currency: "ARS",
  paymentDate: "2026-09-15",
  balanceAfter: 900,
  overdueAmount: 0,
  pdfUrl: null,
};
const schedule = {
  data: [
    {
      installmentNumber: 1,
      dueDate: "2026-09-10",
      amount: 100,
      paidAmount: 100,
      balance: 0,
      status: "paid",
      currency: "ARS",
    },
  ],
  total: 10,
  page: 1,
  limit: 12,
  paidAmount: 100,
  balance: 900,
  overdueAmount: 0,
  credit: 0,
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  jest
    .mocked(prepareDomainAttempt)
    .mockResolvedValue({ storageKey: "attempt", idempotencyKey: "stable-key" });
  jest.mocked(salesApi.getReceipts).mockResolvedValue([receipt] as never);
  jest.mocked(salesApi.getSchedule).mockResolvedValue(schedule as never);
});
afterEach(() => jest.useRealTimers());
async function setup() {
  const onChanged = jest.fn();
  const rendered = render(
    <SaleDetailPanel agreement={agreement} onChanged={onChanged} />,
  );
  await screen.findByText("receipts.preparingPdf");
  return { ...rendered, onChanged };
}
it("polls pending documents, stops when ready, and exposes download failures", async () => {
  await setup();
  jest
    .mocked(salesApi.getReceipts)
    .mockResolvedValue([{ ...receipt, pdfUrl: "db://doc" }] as never);
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.queryByText("receipts.preparingPdf")).not.toBeInTheDocument();
  jest
    .mocked(salesApi.downloadReceiptPdf)
    .mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "receipts.download" }));
  await screen.findByText("receipts.downloadError");
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(salesApi.getReceipts).toHaveBeenCalledTimes(2);
});
it("requires a review before collecting and recovers an uncertain request unchanged", async () => {
  jest
    .mocked(salesApi.createReceipt)
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockResolvedValueOnce({
      ...receipt,
      id: "r2",
      balanceAfter: -100,
    } as never);
  const { onChanged } = await setup();
  fireEvent.change(screen.getByLabelText("receipts.amount"), {
    target: { value: "1100" },
  });
  fireEvent.change(screen.getByLabelText("receipts.paymentDate"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "receipts.create" }));
  expect(salesApi.createReceipt).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await screen.findByText("receipts.uncertain");
  expect(screen.getByLabelText("receipts.amount")).toBeDisabled();
  expect(salesApi.createReceipt).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "receipts.recover" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(jest.mocked(salesApi.createReceipt).mock.calls[1]).toEqual(
    jest.mocked(salesApi.createReceipt).mock.calls[0],
  );
  expect(prepareDomainAttempt).toHaveBeenCalledTimes(1);
  expect(completeDomainAttempt).toHaveBeenCalledTimes(1);
});
it("does not send a collection if its recovery information cannot be saved", async () => {
  jest
    .mocked(prepareDomainAttempt)
    .mockRejectedValueOnce(new Error("Storage blocked"));
  await setup();
  fireEvent.change(screen.getByLabelText("receipts.amount"), {
    target: { value: "100" },
  });
  fireEvent.click(screen.getByRole("button", { name: "receipts.create" }));
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await screen.findByText("receipts.storageError");
  expect(salesApi.createReceipt).not.toHaveBeenCalled();
});
it("continues read-only document recovery after a temporary error and cleans up on unmount", async () => {
  const { unmount } = await setup();
  jest
    .mocked(salesApi.getReceipts)
    .mockRejectedValueOnce(new Error("temporary"));
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByText("receipts.preparingPdf")).toBeInTheDocument();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(salesApi.getReceipts).toHaveBeenCalledTimes(3);
  unmount();
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(salesApi.getReceipts).toHaveBeenCalledTimes(3);
});
it("reports schedule errors instead of presenting zero balances", async () => {
  jest.mocked(salesApi.getSchedule).mockRejectedValue(new Error("offline"));
  await setup();
  expect(screen.getByRole("alert")).toHaveTextContent("scheduleError");
});
