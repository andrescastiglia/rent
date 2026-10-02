import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PaymentRefunds from "./PaymentRefunds";
import { paymentsApi } from "@/lib/api/payments";
import type { Payment } from "@/types/payment";
let mockRole = "admin";
const mockChanged = jest.fn();
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "user", role: mockRole } }),
}));
jest.mock("@/lib/api/payments", () => ({
  paymentsApi: {
    listRefunds: jest.fn(),
    downloadRefund: jest.fn(),
    refund: jest.fn(),
  },
}));
jest.mock("./FinancialCorrectionDialog", () => ({
  __esModule: true,
  default: ({
    maximum,
    execute,
    onComplete,
    onClose,
  }: {
    maximum: number;
    execute: (request: unknown, key: string) => Promise<unknown>;
    onComplete: () => void;
    onClose: () => void;
  }) => (
    <dialog open>
      <p>maximum:{maximum}</p>
      <button
        onClick={() =>
          void execute({ amount: 10, reason: "Error cobro" }, "same-key").then(
            onComplete,
          )
        }
      >
        confirm correction
      </button>
      <button onClick={onClose}>close correction</button>
    </dialog>
  ),
}));
const api = jest.mocked(paymentsApi);
const payment = {
  id: "payment",
  amount: 100,
  refundedAmount: 20,
  currencyCode: "ARS",
  status: "completed",
  reference: "Recibo 1",
} as Payment;
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "admin";
  api.listRefunds.mockResolvedValue([]);
  api.refund.mockResolvedValue({} as never);
  api.downloadRefund.mockResolvedValue(undefined);
});
it.each(["owner", "tenant", "buyer"])(
  "keeps monetary correction unavailable for role %s",
  async (role) => {
    mockRole = role;
    render(<PaymentRefunds payment={payment} onChanged={mockChanged} />);
    await waitFor(() =>
      expect(api.listRefunds).toHaveBeenCalledWith("payment"),
    );
    expect(
      screen.queryByRole("button", { name: "refund" }),
    ).not.toBeInTheDocument();
  },
);
it.each([
  { ...payment, status: "pending" },
  { ...payment, refundedAmount: 100 },
])(
  "only corrects completed payments with remaining refundable amount",
  async (item) => {
    render(
      <PaymentRefunds payment={item as Payment} onChanged={mockChanged} />,
    );
    await waitFor(() => expect(api.listRefunds).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "refund" }),
    ).not.toBeInTheDocument();
  },
);
it("reviews the remaining amount, applies the provided operation key and refreshes after success", async () => {
  render(<PaymentRefunds payment={payment} onChanged={mockChanged} />);
  fireEvent.click(screen.getByRole("button", { name: "refund" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("maximum:80");
  fireEvent.click(screen.getByRole("button", { name: "confirm correction" }));
  await screen.findByText("success");
  expect(api.refund).toHaveBeenCalledWith(
    "payment",
    { amount: 10, reason: "Error cobro" },
    "same-key",
  );
  expect(mockChanged).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("closes a review without submitting and recovers read and PDF failures visibly", async () => {
  api.listRefunds
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([
      {
        id: "refund",
        amount: "20",
        currency: "ARS",
        reason: "Cobro duplicado",
        document_number: "NC 0001",
      },
    ] as never);
  api.downloadRefund.mockRejectedValueOnce(new Error("offline"));
  render(<PaymentRefunds payment={payment} onChanged={mockChanged} />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("Cobro duplicado");
  fireEvent.click(screen.getByRole("button", { name: "download" }));
  await screen.findByRole("alert");
  expect(api.downloadRefund).toHaveBeenCalledWith(
    "payment",
    expect.objectContaining({ id: "refund" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "refund" }));
  fireEvent.click(screen.getByRole("button", { name: "close correction" }));
  expect(api.refund).not.toHaveBeenCalled();
});
