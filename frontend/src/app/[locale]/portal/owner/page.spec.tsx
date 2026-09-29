import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import OwnerDashboardPage from "./page";
import { ownersApi } from "@/lib/api/owners";
import { propertiesApi } from "@/lib/api/properties";
import { useAuth } from "@/contexts/auth-context";

jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ replace: jest.fn() }),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/api/owners", () => ({
  ownersApi: { getMySummary: jest.fn() },
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getAll: jest.fn() },
}));
const summary = {
  propertiesCount: 2,
  activeLeases: 2,
  pendingSettlements: 1,
  period: "2026-09",
  timeZone: "America/Argentina/Buenos_Aires",
  collectionsByCurrency: [
    { currencyCode: "ARS", amount: "9007199254740993.01" },
    { currencyCode: "USD", amount: "25.99" },
  ],
};
const actor = (companyId = "company-1") => ({
  user: {
    id: "owner-1",
    companyId,
    role: "owner",
    roles: ["owner"],
    firstName: "Owner",
  },
  loading: false,
});
beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue(actor());
  (ownersApi.getMySummary as jest.Mock).mockResolvedValue(summary);
  (propertiesApi.getAll as jest.Mock).mockResolvedValue([]);
});
it("renders separate exact currency totals without an invented combined total", async () => {
  render(<OwnerDashboardPage />);
  expect(await screen.findByText("ARS")).toBeInTheDocument();
  expect(screen.getByText("9.007.199.254.740.993,01")).toBeInTheDocument();
  expect(screen.getByText("USD")).toBeInTheDocument();
  expect(screen.getByText("25,99")).toBeInTheDocument();
});
it("shows an error and an explicit retry without misleading zero balances", async () => {
  (ownersApi.getMySummary as jest.Mock).mockRejectedValueOnce(
    new Error("unavailable"),
  );
  render(<OwnerDashboardPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("summaryError");
  expect(screen.queryByText("noCollections")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  expect(await screen.findByText("USD")).toBeInTheDocument();
  expect(ownersApi.getMySummary).toHaveBeenCalledTimes(2);
});
it("discards late responses when the authenticated company changes", async () => {
  let finish: (value: unknown) => void = () => {};
  (ownersApi.getMySummary as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<OwnerDashboardPage />);
  (useAuth as jest.Mock).mockReturnValue(actor("company-2"));
  (ownersApi.getMySummary as jest.Mock).mockResolvedValue({
    ...summary,
    collectionsByCurrency: [],
  });
  view.rerender(<OwnerDashboardPage />);
  expect(await screen.findByText("noCollections")).toBeInTheDocument();
  await act(async () => finish(summary));
  expect(screen.queryByText("USD")).not.toBeInTheDocument();
  expect(screen.getByText("noCollections")).toBeInTheDocument();
});
it("hides previously loaded totals immediately when company changes", async () => {
  const view = render(<OwnerDashboardPage />);
  await screen.findByText("USD");
  (useAuth as jest.Mock).mockReturnValue(actor("company-2"));
  (ownersApi.getMySummary as jest.Mock).mockImplementation(
    () => new Promise(() => {}),
  );
  view.rerender(<OwnerDashboardPage />);
  await waitFor(() =>
    expect(screen.queryByText("USD")).not.toBeInTheDocument(),
  );
});
