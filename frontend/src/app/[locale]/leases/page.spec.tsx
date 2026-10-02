import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import LeasesPage from "./page";
import { leasesApi } from "@/lib/api/leases";
let mockRole = "admin";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: false, user: { role: mockRole } }),
}));
jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));
jest.mock("@/lib/api/leases", () => ({ leasesApi: { getPage: jest.fn() } }));
const api = jest.mocked(leasesApi);
const lease = {
  id: "lease",
  property: { name: "Casa" },
  tenant: { firstName: "Ana", lastName: "Pérez" },
  status: "ACTIVE",
  rentAmount: 1500.45,
  currency: "ARS",
  endDate: "2030-08-01T00:00:00.000Z",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "admin";
  api.getPage.mockResolvedValue({
    data: [lease],
    total: 22,
    page: 1,
    limit: 20,
  } as never);
});
it("loads actual server pages and preserves renewal dates and cents", async () => {
  render(<LeasesPage />);
  const table = await screen.findByRole("table", { name: "title" });
  expect(within(table).getByText(/1\.500,45/)).toBeInTheDocument();
  expect(within(table).getByText(/1 ago 2030/)).toBeInTheDocument();
  api.getPage.mockResolvedValueOnce({
    data: [{ ...lease, id: "second", property: { name: "Casa segunda" } }],
    total: 22,
    page: 2,
    limit: 20,
  } as never);
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("table")).getByText("Casa segunda"),
    ).toBeInTheDocument(),
  );
  expect(api.getPage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      page: 2,
      limit: 20,
      includeFinalized: true,
      contractType: "rental",
    }),
  );
});
it("searches and filters remotely and resets the page", async () => {
  render(<LeasesPage />);
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("search"), {
    target: { value: "  Belgrano  " },
  });
  fireEvent.change(screen.getByLabelText("status"), {
    target: { value: "FINALIZED" },
  });
  await waitFor(() =>
    expect(api.getPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        propertyAddress: "Belgrano",
        status: "FINALIZED",
      }),
    ),
  );
});
it("recovers an unavailable list and renders explicit empty state without management actions for tenants", async () => {
  mockRole = "tenant";
  api.getPage
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
  render(<LeasesPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("error");
  expect(screen.queryByRole("link", { name: "new" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("empty");
});
it("labels expired, missing and unknown party data without inventing amounts", async () => {
  api.getPage.mockResolvedValue({
    data: [
      {
        ...lease,
        endDate: "2000-01-01",
        rentAmount: undefined,
        tenant: undefined,
        property: undefined,
      },
      { ...lease, id: "missing-end", endDate: undefined },
    ],
    total: 2,
    page: 1,
    limit: 20,
  } as never);
  render(<LeasesPage />);
  const table = await screen.findByRole("table");
  expect(within(table).getByText("expired")).toBeInTheDocument();
  expect(within(table).getByText("noEndDate")).toBeInTheDocument();
  expect(within(table).getByText("noTenant")).toBeInTheDocument();
  expect(within(table).getByText("—")).toBeInTheDocument();
});
