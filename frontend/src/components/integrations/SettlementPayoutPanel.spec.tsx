import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettlementPayoutPanel } from "./SettlementPayoutPanel";
import {
  settlementPayoutsApi,
  type PayoutSettlement,
  type SettlementPayoutOverviewDto,
} from "@/lib/api/settlement-payouts";
jest.mock("@/lib/api/settlement-payouts", () => ({
  settlementPayoutsApi: {
    settlement: jest.fn(),
    overview: jest.fn(),
    request: jest.fn(),
    review: jest.fn(),
    downloadReceipt: jest.fn(),
  },
}));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const api = jest.mocked(settlementPayoutsApi);
const settlement: PayoutSettlement = {
  id: "settlement",
  ownerId: "owner",
  period: "2026-09",
  netAmount: "100.25",
  currencyCode: "ARS",
  status: "pending",
  transferReference: null,
};
const empty: SettlementPayoutOverviewDto = {
  enabled: true,
  job: null,
  movements: [],
  reviews: [],
};
function state(
  status: string,
  extra: Partial<NonNullable<SettlementPayoutOverviewDto["job"]>> = {},
): SettlementPayoutOverviewDto {
  return {
    ...empty,
    job: {
      id: "job",
      status: status as NonNullable<
        SettlementPayoutOverviewDto["job"]
      >["status"],
      payoutId: null,
      transactionId: null,
      amount: "100.25",
      currency: "ARS",
      remoteStatus: null,
      remoteDetail: null,
      errorCode: null,
      attempts: 1,
      updatedAt: "2026-09-01T00:00:00Z",
      ...extra,
    },
  };
}
beforeEach(() => {
  jest.resetAllMocks();
  api.settlement.mockResolvedValue(settlement);
  api.overview.mockResolvedValue(empty);
});
const mount = async () => {
  render(<SettlementPayoutPanel ownerId="owner" settlementId="settlement" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "reload" })).toBeEnabled(),
  );
};
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const confirm = () => fireEvent.click(screen.getByRole("checkbox"));
it("keeps the local history readable and blocks all writes when disabled", async () => {
  api.overview.mockResolvedValue({
    ...state("needs_review"),
    enabled: false,
    reviews: [
      {
        id: "review",
        actorId: "actor",
        action: "link",
        reason: "Reviewed company account",
        createdAt: "2026-09-01",
      },
    ],
  });
  await mount();
  expect(screen.getByText("disabled")).toBeInTheDocument();
  expect(screen.getByText("Reviewed company account")).toBeInTheDocument();
  expect(screen.getByLabelText("actionLabel")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "applyReview" }));
  expect(api.review).not.toHaveBeenCalled();
  expect(api.request).not.toHaveBeenCalled();
});
it("requires confirmation, submits the exact amount once and displays queued rather than paid", async () => {
  await mount();
  fill("email", "recipient@example.test");
  const button = screen.getByRole("button", { name: "request" });
  expect(button).toBeDisabled();
  confirm();
  let done!: (value: SettlementPayoutOverviewDto) => void;
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  api.overview.mockResolvedValue(state("queued"));
  fireEvent.click(button);
  fireEvent.click(button);
  expect(api.request).toHaveBeenCalledTimes(1);
  expect(api.request).toHaveBeenCalledWith("settlement", {
    confirmed: true,
    expectedAmount: "100.25",
    currency: "ARS",
    recipientEmail: "recipient@example.test",
  });
  done(state("queued"));
  await screen.findByText("status.queued");
  expect(screen.queryByText("status.completed")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "request" }),
  ).not.toBeInTheDocument();
});
it("invalidates confirmation when the destination changes", async () => {
  await mount();
  fill("email", "first@example.test");
  confirm();
  expect(screen.getByRole("button", { name: "request" })).toBeEnabled();
  fill("email", "second@example.test");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "request" })).toBeDisabled();
});
it("sends checking account details without an empty optional branch or email", async () => {
  await mount();
  fill("destinationType", "bank");
  for (const [field, value] of Object.entries({
    holder: "Account Holder",
    number: "12345",
    bankId: "007",
    branch: "3",
    ownerValue: "20123456789",
    ownerType: "CUIT",
  }))
    fill(`bank.${field}`, value);
  fill("bank.branch", "");
  confirm();
  api.request.mockResolvedValue(state("queued"));
  api.overview.mockResolvedValue(state("queued"));
  fireEvent.click(screen.getByRole("button", { name: "request" }));
  await screen.findByText("status.queued");
  expect(api.request).toHaveBeenCalledWith("settlement", {
    confirmed: true,
    expectedAmount: "100.25",
    currency: "ARS",
    bankAccount: {
      accountType: "checking",
      holder: "Account Holder",
      number: "12345",
      bankId: "007",
      branch: undefined,
      ownerValue: "20123456789",
      ownerType: "CUIT",
    },
  });
});
it("locks writes after a lost response until local state is successfully reloaded", async () => {
  await mount();
  fill("email", "recipient@example.test");
  confirm();
  api.request.mockRejectedValue(new Error("connection lost"));
  fireEvent.click(screen.getByRole("button", { name: "request" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "request" })).toBeDisabled();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  api.overview.mockResolvedValue(
    state("awaiting", { payoutId: "POP1", transactionId: "TOP1" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "reload" }));
  await screen.findByText("status.awaiting");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(api.request).toHaveBeenCalledTimes(1);
});
it("does not present request controls for a different owner", async () => {
  api.settlement.mockResolvedValue({ ...settlement, ownerId: "foreign" });
  await mount();
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("100.25")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "request" }),
  ).not.toBeInTheDocument();
});
it.each([
  { currencyCode: "USD" },
  { netAmount: "0.00" },
  { netAmount: "100.255" },
  { status: "completed" },
  { transferReference: "already-paid" },
])("blocks an ineligible settlement %j", async (change) => {
  api.settlement.mockResolvedValue({ ...settlement, ...change });
  await mount();
  expect(screen.getByText("ineligible")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "request" }),
  ).not.toBeInTheDocument();
});
it("only permits verified linking for an uncertain creation, with reason and confirmation", async () => {
  api.overview.mockResolvedValue(
    state("needs_review", { errorCode: "create_outcome_unknown" }),
  );
  await mount();
  expect(
    screen.queryByRole("option", { name: "action.retry" }),
  ).not.toBeInTheDocument();
  fill("actionLabel", "link");
  fill("payoutId", "POP123");
  fill("transactionId", "TOP123");
  fill("reason", "Verified company transfer");
  const button = screen.getByRole("button", { name: "applyReview" });
  expect(button).toBeDisabled();
  confirm();
  api.review.mockResolvedValue(state("awaiting"));
  api.overview.mockResolvedValue(state("awaiting"));
  fireEvent.click(button);
  await screen.findByText("status.awaiting");
  expect(api.review).toHaveBeenCalledWith("settlement", {
    confirmed: true,
    action: "link",
    reason: "Verified company transfer",
    payoutId: "POP123",
    transactionId: "TOP123",
  });
  expect(api.request).not.toHaveBeenCalled();
});
it("requires valid identifiers and clears confirmation when review details change", async () => {
  api.overview.mockResolvedValue(state("needs_review"));
  await mount();
  fill("actionLabel", "link");
  fill("reason", "Verified company transfer");
  fill("payoutId", "invalid");
  fill("transactionId", "TOP123");
  confirm();
  expect(screen.getByRole("button", { name: "applyReview" })).toBeDisabled();
  fill("payoutId", "POP123");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("offers retry only for a definite rejection with no remote IDs", async () => {
  api.overview.mockResolvedValue(
    state("failed", { errorCode: "provider_rejected" }),
  );
  await mount();
  fill("actionLabel", "retry");
  fill("reason", "Provider rejection resolved");
  confirm();
  api.review.mockResolvedValue(state("queued"));
  api.overview.mockResolvedValue(state("queued"));
  fireEvent.click(screen.getByRole("button", { name: "applyReview" }));
  await screen.findByText("status.queued");
  expect(api.review).toHaveBeenCalledWith("settlement", {
    confirmed: true,
    action: "retry",
    reason: "Provider rejection resolved",
  });
});
it("limits known rejected transfers to reconciliation instead of resending", async () => {
  api.overview.mockResolvedValue(
    state("failed", {
      payoutId: "POP1",
      transactionId: "TOP1",
      errorCode: "transfer_not_accredited",
    }),
  );
  await mount();
  expect(
    screen.queryByRole("option", { name: "action.retry" }),
  ).not.toBeInTheDocument();
  fill("actionLabel", "refresh");
  fill("reason", "Check latest provider state");
  confirm();
  api.review.mockResolvedValue(state("awaiting"));
  api.overview.mockResolvedValue(state("awaiting"));
  fireEvent.click(screen.getByRole("button", { name: "applyReview" }));
  await screen.findByText("status.awaiting");
  expect(api.review).toHaveBeenCalledWith("settlement", {
    confirmed: true,
    action: "refresh",
    reason: "Check latest provider state",
  });
});
it("shows partial refunds and their existing ledger without offering another transfer", async () => {
  api.overview.mockResolvedValue({
    ...state("needs_review", {
      payoutId: "POP1",
      transactionId: "TOP1",
      errorCode: "partial_refund_requires_review",
      remoteStatus: "approved",
      remoteDetail: "partially_refunded",
    }),
    movements: [
      {
        id: "m",
        receiptAvailable: true,
        receiptStatus: "completed",
        kind: "transfer",
        amount: "100.25",
        currency: "ARS",
        transactionId: "TOP1",
        providerUpdatedAt: "2026-09-01",
        createdAt: "2026-09-01",
      },
    ],
  });
  await mount();
  expect(screen.getByText("partialRefund")).toBeInTheDocument();
  expect(screen.getByText("movements")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "request" }),
  ).not.toBeInTheDocument();
});
it("shows unknown provider job states safely", async () => {
  api.overview.mockResolvedValue(state("future_state"));
  await mount();
  expect(screen.getByText("status.unknown")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "request" }),
  ).not.toBeInTheDocument();
});
it("blocks writes when initial history fails and permits a read-only recovery", async () => {
  api.overview.mockRejectedValueOnce(new Error("offline"));
  await mount();
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "reload" }));
  await screen.findByText("status.none");
  expect(api.request).not.toHaveBeenCalled();
});
it("downloads a recorded receipt while disabled and reports failures without resending money", async () => {
  api.overview.mockResolvedValue({
    ...state("completed", { payoutId: "POP1", transactionId: "TOP1" }),
    enabled: false,
    movements: [
      {
        id: "m",
        receiptAvailable: true,
        receiptStatus: "completed",
        kind: "transfer",
        amount: "100.25",
        currency: "ARS",
        transactionId: "TOP1",
        providerUpdatedAt: "2026-09-01",
        createdAt: "2026-09-01",
      },
    ],
  });
  api.downloadReceipt.mockRejectedValueOnce(new Error("unavailable"));
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "downloadReceipt" }));
  await screen.findByText("receiptError");
  expect(api.downloadReceipt).toHaveBeenCalledWith("settlement", "m");
  api.downloadReceipt.mockResolvedValue();
  fireEvent.click(screen.getByRole("button", { name: "downloadReceipt" }));
  await waitFor(() =>
    expect(screen.queryByText("receiptError")).not.toBeInTheDocument(),
  );
  expect(api.request).not.toHaveBeenCalled();
  expect(api.review).not.toHaveBeenCalled();
});
