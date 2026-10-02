import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import PaymentsPage from "./page";
import { paymentsApi } from "@/lib/api/payments";
import { ownersApi } from "@/lib/api/owners";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: false }),
}));
jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));
jest.mock("@/lib/api/payments", () => ({ paymentsApi: { getAll: jest.fn() } }));
jest.mock("@/lib/api/owners", () => ({
  ownersApi: { listSettlementPayments: jest.fn() },
}));
const api = jest.mocked(paymentsApi),
  owners = jest.mocked(ownersApi);
const payment = {
  id: "payment",
  amount: 1000.25,
  currencyCode: "ARS",
  paymentDate: "2026-10-01",
  activityType: "monthly",
  status: "pending",
  reference: "Recibo A",
  tenantAccount: {
    lease: {
      id: "lease",
      property: { name: "Casa" },
      tenant: { firstName: "Ana", lastName: "Pérez" },
    },
  },
};
beforeEach(() => {
  jest.clearAllMocks();
  api.getAll.mockResolvedValue({
    data: [payment],
    total: 23,
    page: 1,
    limit: 20,
  } as never);
  owners.listSettlementPayments.mockResolvedValue([]);
});
it("paginates collections on the server, retaining monetary cents and civil dates", async () => {
  render(<PaymentsPage />);
  const table = await screen.findByRole("table", { name: "title" });
  expect(within(table).getByText(/1\.000,25/)).toBeInTheDocument();
  expect(within(table).getByText("1/10/2026")).toBeInTheDocument();
  api.getAll.mockResolvedValueOnce({
    data: [{ ...payment, id: "second", reference: "Recibo B" }],
    total: 23,
    page: 2,
    limit: 20,
  } as never);
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await screen.findByText("Recibo B");
  expect(api.getAll).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 2, limit: 20 }),
  );
  fireEvent.change(screen.getByLabelText("status"), {
    target: { value: "completed" },
  });
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, status: "completed" }),
    ),
  );
});
it("sends search and activity filters to the server", async () => {
  render(<PaymentsPage />);
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("search"), {
    target: { value: "Ana" },
  });
  fireEvent.change(screen.getByLabelText("activity"), {
    target: { value: "late_fee" },
  });
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "Ana",
        activityType: "late_fee",
        page: 1,
      }),
    ),
  );
});
it("recovers failed collections without displaying empty success", async () => {
  api.getAll.mockRejectedValueOnce(new Error("offline"));
  render(<PaymentsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("error");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByRole("table");
  expect(api.getAll).toHaveBeenCalledTimes(2);
});
it("loads owner settlements only when opened and recovers errors explicitly", async () => {
  owners.listSettlementPayments
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([
      {
        id: "settlement",
        ownerName: "María",
        period: "2026-09",
        netAmount: 2000.35,
        currencyCode: "ARS",
      },
    ] as never);
  render(<PaymentsPage />);
  await screen.findByRole("table");
  expect(owners.listSettlementPayments).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "settlements" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("María · 2026-09");
  expect(owners.listSettlementPayments).toHaveBeenLastCalledWith(50);
  expect(screen.getByText(/2\.000,35/)).toBeInTheDocument();
});
