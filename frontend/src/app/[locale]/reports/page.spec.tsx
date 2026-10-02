import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import ReportsPage from "./page";
import { dashboardApi } from "@/lib/api/dashboard";
let mockLoading = false;
jest.mock("next-intl", () => ({
  useLocale: () => "es-AR",
  useTranslations: () => (key: string) => key,
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: mockLoading }),
}));
jest.mock("@/lib/api/dashboard", () => ({
  dashboardApi: { getReports: jest.fn() },
}));
const api = jest.mocked(dashboardApi);
const report = {
  id: "report",
  reportType: "monthly_summary",
  status: "completed",
  ownerName: "Ana Pérez",
  ownerId: "owner",
  period: "2026-10",
  recordsTotal: 12,
  recordsProcessed: 12,
  recordsFailed: 0,
  dryRun: false,
  createdAt: "2026-10-02T15:00:00Z",
  completedAt: "2026-10-02T15:00:01Z",
  errorMessage: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  api.getReports.mockResolvedValue({
    data: [report],
    page: 1,
    limit: 25,
    total: 30,
  } as never);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it("waits for authentication, renders the financial outcome and navigates the server pages", async () => {
  mockLoading = true;
  const view = render(<ReportsPage />);
  expect(api.getReports).not.toHaveBeenCalled();
  mockLoading = false;
  view.rerender(<ReportsPage />);
  await screen.findByText("Ana Pérez");
  expect(screen.getByText("10/2026")).toBeInTheDocument();
  expect(screen.getByText("12/12")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "prev" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await waitFor(() => expect(api.getReports).toHaveBeenLastCalledWith(2, 25));
  await screen.findByText("Ana Pérez");
  expect(screen.getByRole("button", { name: "next" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "prev" }));
  await waitFor(() => expect(api.getReports).toHaveBeenLastCalledWith(1, 25));
});
it("sorts current runs, exposes partial failures and marks simulations explicitly", async () => {
  api.getReports.mockResolvedValueOnce({
    data: [
      report,
      {
        ...report,
        id: "newer",
        reportType: "settlement",
        status: "partial_failure",
        ownerName: "Nora",
        dryRun: true,
        period: null,
        completedAt: null,
        recordsProcessed: 10,
        recordsFailed: 2,
        errorMessage: "Dos registros fallaron",
        createdAt: "2026-10-03",
      },
      { ...report, id: "legacy", ownerName: "Legacy", period: "historical" },
    ],
    total: 3,
    page: 1,
    limit: 25,
  } as never);
  render(<ReportsPage />);
  await screen.findByText("Nora");
  const rows = screen.getAllByRole("row");
  expect(within(rows[1]).getByText("Nora")).toBeInTheDocument();
  expect(screen.getByText("status.partial_failure")).toBeInTheDocument();
  expect(screen.getByText("Dos registros fallaron")).toBeInTheDocument();
  expect(screen.getByText("dryRun")).toBeInTheDocument();
  expect(screen.getByText("historical")).toBeInTheDocument();
  expect(screen.getByText(/10\/12/)).toHaveTextContent("failedCount");
});
it("does not represent a failed report read as a successful empty history", async () => {
  api.getReports.mockRejectedValueOnce(new Error("offline"));
  render(<ReportsPage />);
  await screen.findByRole("alert");
  expect(screen.queryByText("empty")).not.toBeInTheDocument();
  expect(api.getReports).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("Ana Pérez");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(api.getReports).toHaveBeenCalledTimes(2);
});
it("shows an honest empty history and omits pagination when no records exist", async () => {
  api.getReports.mockResolvedValueOnce({
    data: [],
    total: 0,
    page: 1,
    limit: 25,
  });
  render(<ReportsPage />);
  await screen.findByText("empty");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "next" }),
  ).not.toBeInTheDocument();
});
