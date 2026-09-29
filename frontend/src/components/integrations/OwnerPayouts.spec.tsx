import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OwnerPayouts } from "./OwnerPayouts";
import {
  settlementPayoutsApi,
  type PayoutSettlement,
} from "@/lib/api/settlement-payouts";
jest.mock("@/lib/api/settlement-payouts", () => ({
  settlementPayoutsApi: { list: jest.fn() },
}));
jest.mock("./SettlementPayoutPanel", () => ({
  SettlementPayoutPanel: ({ settlementId }: { settlementId: string }) => (
    <div data-testid="panel">{settlementId}</div>
  ),
}));
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
const api = jest.mocked(settlementPayoutsApi);
const settlement: PayoutSettlement = {
  id: "first",
  ownerId: "owner",
  period: "2026-09",
  netAmount: "100.00",
  currencyCode: "ARS",
  status: "pending",
  transferReference: null,
};
beforeEach(() => {
  jest.resetAllMocks();
  api.list.mockResolvedValue([settlement]);
});
it("selects settlements from the requested owner and supports changing the selection", async () => {
  api.list.mockResolvedValue([settlement, { ...settlement, id: "second" }]);
  render(<OwnerPayouts ownerId="owner" />);
  expect(await screen.findByTestId("panel")).toHaveTextContent("first");
  expect(api.list).toHaveBeenCalledWith("owner");
  fireEvent.change(screen.getByLabelText("settlement"), {
    target: { value: "second" },
  });
  expect(screen.getByTestId("panel")).toHaveTextContent("second");
});
it("does not silently present a partial or failed load as an empty history", async () => {
  api.list.mockRejectedValueOnce(new Error("offline"));
  render(<OwnerPayouts ownerId="owner" />);
  await screen.findByRole("alert");
  expect(screen.queryByText("empty")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "reloadList" }));
  await screen.findByTestId("panel");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("rejects a list containing another owner's settlement", async () => {
  api.list.mockResolvedValue([{ ...settlement, ownerId: "foreign" }]);
  render(<OwnerPayouts ownerId="owner" />);
  await screen.findByRole("alert");
  expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
});
it("clears the selected panel when reloading an empty list", async () => {
  render(<OwnerPayouts ownerId="owner" />);
  await screen.findByTestId("panel");
  api.list.mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "reloadList" }));
  await screen.findByText("empty");
  expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
});
it("ignores late responses after the company or owner scope remounts", async () => {
  let resolve!: (rows: PayoutSettlement[]) => void;
  api.list.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(<OwnerPayouts key="old" ownerId="old" />);
  api.list.mockResolvedValue([
    { ...settlement, id: "new-settlement", ownerId: "new" },
  ]);
  view.rerender(<OwnerPayouts key="new" ownerId="new" />);
  await screen.findByTestId("panel");
  resolve([{ ...settlement, id: "old-settlement", ownerId: "old" }]);
  await waitFor(() =>
    expect(screen.getByTestId("panel")).toHaveTextContent("new-settlement"),
  );
});
