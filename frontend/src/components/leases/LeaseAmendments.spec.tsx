import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LeaseAmendments } from "./LeaseAmendments";
import { amendmentsApi, type LeaseAmendment } from "@/lib/api/amendments";
import { ApiRequestError } from "@/lib/api";
jest.mock("@/lib/api/amendments", () => ({
  amendmentsApi: { list: jest.fn(), review: jest.fn(), history: jest.fn() },
}));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const api = jest.mocked(amendmentsApi);
const amendment = (overrides: Partial<LeaseAmendment> = {}): LeaseAmendment =>
  ({
    id: "amendment",
    leaseId: "lease",
    amendmentNumber: 1,
    status: "approved",
    applicationStatus: "legacy_review",
    effectiveDate: "2026-09-01",
    updatedAt: "2026-09-29T12:00:00.000Z",
    description: "Rental amendment",
    newValues: { monthlyRent: 1200 },
    appliedAt: null,
    applicationSnapshot: null,
    ...overrides,
  }) as LeaseAmendment;
const onChanged = jest.fn();
function mount(canReview = true) {
  return render(
    <LeaseAmendments
      leaseId="lease"
      canReview={canReview}
      onChanged={onChanged}
    />,
  );
}
async function select(action = "cancel") {
  fireEvent.click(await screen.findByRole("button", { name: action }));
  fireEvent.change(screen.getByLabelText("reason"), {
    target: { value: "The parties cancelled this change" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "confirm" }));
}
beforeEach(() => {
  jest.resetAllMocks();
  api.list.mockResolvedValue([amendment()]);
  api.history.mockResolvedValue([]);
  onChanged.mockResolvedValue(undefined);
  jest
    .spyOn(crypto, "randomUUID")
    .mockReturnValue("00000000-0000-4000-8000-000000000001");
});
afterEach(() => jest.restoreAllMocks());

it("shows approval and application independently without write controls for a read-only user", async () => {
  mount(false);
  expect(
    await screen.findByText(/application.legacy_review/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "cancel" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "schedule" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "history" }),
  ).not.toBeInTheDocument();
  expect(api.review).not.toHaveBeenCalled();
});
it("requires confirmation and reason, then sends the observed version and one stable key", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "cancel" }));
  expect(screen.getByRole("button", { name: "submit" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("reason"), {
    target: { value: "Administrative cancellation" },
  });
  expect(screen.getByRole("button", { name: "submit" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "confirm" }));
  api.review.mockResolvedValue({
    amendment: amendment({ status: "cancelled", applicationStatus: "none" }),
    review: {},
  } as never);
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(api.review).toHaveBeenCalledWith("amendment", {
    action: "cancel",
    reason: "Administrative cancellation",
    expectedUpdatedAt: "2026-09-29T12:00:00.000Z",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
  });
  expect(
    screen.queryByRole("button", { name: "cancel" }),
  ).not.toBeInTheDocument();
});
it("recovers an uncertain response with the same payload even after refreshing changed state", async () => {
  mount();
  await select("schedule");
  api.review
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({
      amendment: amendment({
        applicationStatus: "applied",
        appliedAt: "2026-09-29T12:05:00.000Z",
      }),
      review: {},
    } as never);
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await screen.findByText("uncertain");
  expect(screen.getByLabelText("reason")).toBeDisabled();
  expect(screen.getByRole("button", { name: "back" })).toBeDisabled();
  api.list.mockResolvedValue([
    amendment({
      applicationStatus: "applied",
      updatedAt: "2026-09-29T12:05:00.000Z",
    }),
  ]);
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "recover" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(api.review.mock.calls[1]).toEqual(api.review.mock.calls[0]);
  expect(api.review.mock.calls[1][1].action).toBe("schedule");
});
it("does not send twice while the first review is pending", async () => {
  let resolve!: (value: never) => void;
  api.review.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  mount();
  await select();
  const button = screen.getByRole("button", { name: "submit" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(api.review).toHaveBeenCalledTimes(1);
  await act(async () =>
    resolve({
      amendment: amendment({ status: "cancelled" }),
      review: {},
    } as never),
  );
});
it("forces a fresh read after a definite conflict and does not replay an obsolete decision", async () => {
  api.review.mockRejectedValue(new ApiRequestError(409, "changed"));
  mount();
  await select();
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await screen.findByText("rejected");
  expect(screen.queryByLabelText("reason")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "cancel" })).toBeEnabled(),
  );
  expect(api.review).toHaveBeenCalledTimes(1);
});
it("keeps a completed review completed when refreshing the contract fails", async () => {
  api.review.mockResolvedValue({
    amendment: amendment({ status: "cancelled" }),
    review: {},
  } as never);
  onChanged.mockRejectedValue(new Error("read failed"));
  mount();
  await select();
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await screen.findByText("readError");
  expect(
    screen.queryByRole("button", { name: "recover" }),
  ).not.toBeInTheDocument();
  expect(api.review).toHaveBeenCalledTimes(1);
});
it("shows audit history and preserves a separate error if history cannot load", async () => {
  api.history
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([
      {
        id: "review",
        action: "cancel",
        reason: "Reviewed cancellation reason",
        performedBy: "reviewer",
        performedAt: "2026-09-29T12:00:00.000Z",
        before: { status: "approved" },
        after: { status: "cancelled" },
      },
    ] as never);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "history" }));
  await screen.findByText("historyError");
  fireEvent.click(screen.getByRole("button", { name: "history" }));
  expect(
    await screen.findByText("Reviewed cancellation reason"),
  ).toBeInTheDocument();
  expect(api.history).toHaveBeenCalledWith("amendment");
});
it("never offers cancelling or scheduling an applied amendment", async () => {
  api.list.mockResolvedValue([
    amendment({
      applicationStatus: "applied",
      appliedAt: "2026-09-29T12:00:00.000Z",
      applicationSnapshot: {
        before: { monthlyRent: "1000.00" },
        after: { monthlyRent: 1200 },
      },
    }),
  ]);
  mount();
  await screen.findByRole("button", { name: "history" });
  expect(
    screen.queryByRole("button", { name: "cancel" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "schedule" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("1000.00")).toBeInTheDocument();
});
it("distinguishes an empty list from a failed read and allows retry", async () => {
  api.list
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([]);
  mount();
  await screen.findByText("readError");
  expect(screen.queryByText("empty")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  expect(await screen.findByText("empty")).toBeInTheDocument();
});
it("ignores a late response after leaving the contract", async () => {
  let resolve!: (value: LeaseAmendment[]) => void;
  api.list.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { unmount } = mount();
  unmount();
  await act(async () => resolve([amendment()]));
  expect(onChanged).not.toHaveBeenCalled();
});
