import { fireEvent, render, screen, within } from "@testing-library/react";
import SalesPage from "./page";
import { salesApi } from "@/lib/api/sales";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "user", companyId: "company" },
  }),
}));
jest.mock("@/components/sales/SaleDetailPanel", () => ({
  __esModule: true,
  default: ({ agreement }: { agreement: { buyerName: string } }) => (
    <section aria-label="sale-detail">{agreement.buyerName}</section>
  ),
}));
jest.mock("@/components/sales/SaleFormDialog", () => ({
  __esModule: true,
  default: () => <dialog open>new-sale</dialog>,
}));
jest.mock("@/lib/api/sales", () => ({
  salesApi: {
    getFolders: jest.fn(),
    getAgreementPage: jest.fn(),
    getReceipts: jest.fn(),
  },
}));
const agreement = {
  id: "agreement",
  buyerName: "Comprador A",
  currency: "ARS",
  totalAmount: 1000,
  paidAmount: 100,
  installmentAmount: 100,
  installmentCount: 10,
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(salesApi.getFolders).mockResolvedValue([]);
  jest.mocked(salesApi.getAgreementPage).mockResolvedValue({
    data: [agreement],
    total: 21,
    page: 1,
    limit: 20,
  } as never);
});
it("loads a server page without querying receipts for every agreement", async () => {
  render(<SalesPage />);
  const table = await screen.findByRole("table", { name: "title" });
  expect(salesApi.getReceipts).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("region", { name: "sale-detail" }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(table).getByRole("button", { name: "detail" }));
  expect(screen.getByRole("region", { name: "sale-detail" })).toHaveTextContent(
    "Comprador A",
  );
});
it("opens records from a later server page", async () => {
  render(<SalesPage />);
  await screen.findByRole("table", { name: "title" });
  jest.mocked(salesApi.getAgreementPage).mockResolvedValueOnce({
    data: [{ ...agreement, id: "page-two", buyerName: "Comprador B" }],
    total: 21,
    page: 2,
    limit: 20,
  } as never);
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  const table = await screen.findByRole("table", { name: "title" });
  expect(within(table).getByText("Comprador B")).toBeInTheDocument();
  expect(salesApi.getAgreementPage).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 2, limit: 20 }),
  );
});
it("separates the new sale form from the list and reports a server error", async () => {
  jest
    .mocked(salesApi.getAgreementPage)
    .mockRejectedValueOnce(new Error("offline"));
  render(<SalesPage />);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("error");
  fireEvent.click(screen.getByRole("button", { name: "agreements.new" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("new-sale");
});
