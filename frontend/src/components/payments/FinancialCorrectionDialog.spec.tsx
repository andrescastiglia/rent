import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FinancialCorrectionDialog from "./FinancialCorrectionDialog";
import {
  completeDomainAttempt,
  prepareDomainAttempt,
} from "@/lib/domain-operation";
import { ApiRequestError } from "@/lib/api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "user", companyId: "company" } }),
}));
jest.mock("@/lib/domain-operation", () => ({
  prepareDomainAttempt: jest.fn(),
  completeDomainAttempt: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  jest.mocked(prepareDomainAttempt).mockResolvedValue({
    storageKey: "recover",
    idempotencyKey: "same-attempt",
  });
});
function setup(execute = jest.fn().mockResolvedValue({ id: "refund" })) {
  const onComplete = jest.fn(),
    onClose = jest.fn();
  render(
    <FinancialCorrectionDialog
      entityId="payment"
      namespace="payment-refund"
      title="Refund"
      description="Recibo 10"
      currency="ARS"
      maximum={100}
      execute={execute}
      onComplete={onComplete}
      onClose={onClose}
    />,
  );
  fireEvent.change(screen.getByLabelText("amount"), {
    target: { value: "40" },
  });
  fireEvent.change(screen.getByLabelText("reason"), {
    target: { value: "Devolución parcial acordada" },
  });
  return { execute, onComplete, onClose };
}
it("requires a review and explicit confirmation before modifying money", async () => {
  const { execute, onComplete } = setup();
  fireEvent.click(screen.getByRole("button", { name: "review" }));
  expect(execute).not.toHaveBeenCalled();
  expect(screen.getByText("impact")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect(execute).toHaveBeenCalledWith(
    { amount: 40, reason: "Devolución parcial acordada" },
    "same-attempt",
  );
  expect(completeDomainAttempt).toHaveBeenCalledTimes(1);
});
it("freezes an uncertain request and recovers its original key without automatic retries", async () => {
  const execute = jest
    .fn()
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockResolvedValueOnce({ id: "refund" });
  setup(execute);
  fireEvent.click(screen.getByRole("button", { name: "review" }));
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await screen.findByText("uncertain");
  expect(screen.getByLabelText("amount")).toBeDisabled();
  expect(screen.getByLabelText("reason")).toBeDisabled();
  expect(execute).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  expect(execute.mock.calls[1]).toEqual(execute.mock.calls[0]);
  expect(prepareDomainAttempt).toHaveBeenCalledTimes(1);
});
it("does not send a correction when recovery information cannot be saved", async () => {
  jest
    .mocked(prepareDomainAttempt)
    .mockRejectedValue(new Error("Storage blocked"));
  const { execute } = setup();
  fireEvent.click(screen.getByRole("button", { name: "review" }));
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await screen.findByText("storageError");
  expect(execute).not.toHaveBeenCalled();
});
it("releases a definitively rejected first attempt and keeps the values for correction", async () => {
  const { execute } = setup(
    jest.fn().mockRejectedValue(new ApiRequestError(422, "Saldo insuficiente")),
  );
  fireEvent.click(screen.getByRole("button", { name: "review" }));
  fireEvent.click(screen.getByRole("button", { name: "confirm" }));
  await screen.findByText("rejected");
  expect(execute).toHaveBeenCalledTimes(1);
  expect(completeDomainAttempt).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("amount")).toBeEnabled();
});
it("rejects amounts above the available balance", () => {
  const { execute } = setup();
  fireEvent.change(screen.getByLabelText("amount"), {
    target: { value: "101" },
  });
  expect(screen.getByRole("button", { name: "review" })).toBeDisabled();
  expect(execute).not.toHaveBeenCalled();
});
