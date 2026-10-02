import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import PendingActionReviewDialog from "./PendingActionReviewDialog";
import { dashboardApi, type PersonActivityItem } from "@/lib/api/dashboard";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/lib/api/dashboard", () => ({
  dashboardApi: { getPendingActionReview: jest.fn() },
}));
const review = {
  entityLabel: "Factura 10",
  currentState: { balance: "100.00" },
  proposedChange: { amount: "50.00" },
  amount: "50.00",
  currency: "ARS",
  impact: ["Reduce el saldo"],
  observedVersion: "version-1",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
const item = {
  id: "activity",
  actionId: "action",
  subject: "Cobrar factura",
} as PersonActivityItem;
beforeEach(() => {
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  jest.mocked(dashboardApi.getPendingActionReview).mockResolvedValue(review);
});
it("shows a backend review before enabling confirmation", async () => {
  const onConfirm = jest.fn();
  render(
    <PendingActionReviewDialog
      item={item}
      password="password"
      error={null}
      busy={false}
      onPasswordChange={jest.fn()}
      onCancel={jest.fn()}
      onConfirm={onConfirm}
    />,
  );
  expect(
    screen.getByRole("button", { name: "peopleActivity.actions.approve" }),
  ).toBeDisabled();
  await screen.findByText("Factura 10");
  expect(screen.getByText(/version-1/)).toBeInTheDocument();
  expect(screen.getByText("Reduce el saldo")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "peopleActivity.actions.approve" }),
  );
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
it("blocks expired proposals and offers no automatic mutation", async () => {
  jest.mocked(dashboardApi.getPendingActionReview).mockResolvedValue({
    ...review,
    expiresAt: new Date(Date.now() - 1).toISOString(),
  });
  const onConfirm = jest.fn();
  render(
    <PendingActionReviewDialog
      item={item}
      password="password"
      error={null}
      busy={false}
      onPasswordChange={jest.fn()}
      onCancel={jest.fn()}
      onConfirm={onConfirm}
    />,
  );
  await screen.findByText("expired");
  expect(
    screen.getByRole("button", { name: "peopleActivity.actions.approve" }),
  ).toBeDisabled();
  expect(onConfirm).not.toHaveBeenCalled();
});
it("keeps confirmation disabled until a failed review is recovered", async () => {
  jest
    .mocked(dashboardApi.getPendingActionReview)
    .mockRejectedValueOnce(new Error("offline"));
  render(
    <PendingActionReviewDialog
      item={item}
      password="password"
      error={null}
      busy={false}
      onPasswordChange={jest.fn()}
      onCancel={jest.fn()}
      onConfirm={jest.fn()}
    />,
  );
  await screen.findByText("unavailable");
  expect(
    screen.getByRole("button", { name: "peopleActivity.actions.approve" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "peopleActivity.actions.approve" }),
    ).toBeEnabled(),
  );
  expect(dashboardApi.getPendingActionReview).toHaveBeenCalledTimes(2);
});
it("does not retain a previous entity review while a new entity loads", async () => {
  const props = {
    item,
    password: "password",
    error: null,
    busy: false,
    onPasswordChange: jest.fn(),
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
  };
  const { rerender } = render(<PendingActionReviewDialog {...props} />);
  await screen.findByText("Factura 10");
  let resolve!: (value: typeof review) => void;
  jest.mocked(dashboardApi.getPendingActionReview).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  rerender(
    <PendingActionReviewDialog
      {...props}
      item={{ ...item, actionId: "action-2" }}
    />,
  );
  expect(screen.queryByText("Factura 10")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "peopleActivity.actions.approve" }),
  ).toBeDisabled();
  await act(async () => resolve({ ...review, entityLabel: "Factura 11" }));
  expect(screen.getByText("Factura 11")).toBeInTheDocument();
});
