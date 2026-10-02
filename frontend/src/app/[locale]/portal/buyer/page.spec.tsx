import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BuyerPortalPage from "./page";
import { salesApi } from "@/lib/api/sales";
let mockRole = "buyer";
const mockLogout = jest.fn();
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { role: mockRole }, logout: mockLogout }),
}));
jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));
jest.mock("@/lib/api/sales", () => ({
  salesApi: { getAgreementPage: jest.fn() },
}));
jest.mock("@/components/sales/SaleDetailPanel", () => ({
  __esModule: true,
  default: ({
    readOnly,
    agreement,
  }: {
    readOnly: boolean;
    agreement: { buyerName: string };
  }) => (
    <section aria-label="agreement detail">
      <p>
        {agreement.buyerName} {readOnly ? "readonly" : "writable"}
      </p>
    </section>
  ),
}));
const api = jest.mocked(salesApi);
const agreement = {
  id: "agreement",
  buyerName: "Mi acuerdo",
  currency: "USD",
  installmentCount: 20,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "buyer";
  api.getAgreementPage.mockResolvedValue({
    data: [agreement],
    total: 21,
    page: 1,
    limit: 20,
  } as never);
});
it("shows own paged agreements and a read-only review", async () => {
  render(<BuyerPortalPage />);
  await screen.findByText("Mi acuerdo");
  fireEvent.click(screen.getByRole("button", { name: "detail" }));
  expect(
    screen.getByRole("region", { name: "agreement detail" }),
  ).toHaveTextContent("readonly");
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  expect(
    screen.queryByRole("region", { name: "agreement detail" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await waitFor(() =>
    expect(api.getAgreementPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ),
  );
  fireEvent.change(screen.getByLabelText("search"), {
    target: { value: "Nuevo" },
  });
  await waitFor(() =>
    expect(api.getAgreementPage).toHaveBeenLastCalledWith({
      page: 1,
      limit: 20,
      search: "Nuevo",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "logout" }));
  expect(mockLogout).toHaveBeenCalledTimes(1);
});
it("does not query agreements for another role", () => {
  mockRole = "tenant";
  render(<BuyerPortalPage />);
  expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
  expect(api.getAgreementPage).not.toHaveBeenCalled();
});
it("distinguishes failed reads from empty agreements and retries only explicitly", async () => {
  api.getAgreementPage
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
  render(<BuyerPortalPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("error");
  expect(api.getAgreementPage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("empty");
  expect(api.getAgreementPage).toHaveBeenCalledTimes(2);
});
