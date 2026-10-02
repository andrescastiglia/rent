import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import PropertiesPage from "./page";
import { propertiesApi } from "@/lib/api/properties";
let mockRole = "admin";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: false, user: { id: "user", role: mockRole } }),
}));
jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getPage: jest.fn() },
}));
jest.mock("@/components/properties/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: { name: string } }) => (
    <article>{property.name}</article>
  ),
}));
const api = jest.mocked(propertiesApi);
const property = {
  id: "property",
  name: "Casa Los Aromos",
  operationState: "available",
  price: 1000,
  currency: "ARS",
  address: { street: "Belgrano", number: "20", city: "Córdoba" },
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "admin";
  window.history.replaceState(null, "", "/es/properties");
  api.getPage.mockResolvedValue({
    data: [property],
    total: 23,
    page: 1,
    limit: 20,
  } as never);
});
it("loads a true server page and navigates to later records", async () => {
  render(<PropertiesPage />);
  const table = await screen.findByRole("table", { name: "title" });
  expect(within(table).getByText("Casa Los Aromos")).toBeInTheDocument();
  api.getPage.mockResolvedValueOnce({
    data: [{ ...property, id: "second", name: "Casa de página dos" }],
    total: 23,
    page: 2,
    limit: 20,
  } as never);
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("table")).getByText("Casa de página dos"),
    ).toBeInTheDocument(),
  );
  expect(api.getPage).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 2, limit: 20 }),
  );
  expect(window.location.search).toContain("page=2");
});
it("restores filters from the URL and browser navigation", async () => {
  window.history.replaceState(
    null,
    "",
    "/es/properties?search=Belgrano&operation=rent&state=rented&order=address&page=3&city=Cordoba",
  );
  render(<PropertiesPage />);
  await screen.findByRole("table");
  expect(api.getPage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      search: "Belgrano",
      operation: "rent",
      operationState: "rented",
      order: "address",
      page: 3,
      addressCity: "Cordoba",
    }),
  );
  window.history.replaceState(null, "", "/es/properties?operation=sale&page=2");
  fireEvent(window, new PopStateEvent("popstate"));
  await waitFor(() =>
    expect(api.getPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: "sale", page: 2 }),
    ),
  );
  expect(screen.getByLabelText("search")).toHaveValue("");
});
it("resets the page when filters change and preserves it when switching photos", async () => {
  window.history.replaceState(null, "", "/es/properties?page=2");
  render(<PropertiesPage />);
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("search"), {
    target: { value: "nueva búsqueda" },
  });
  await waitFor(() =>
    expect(api.getPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, search: "nueva búsqueda" }),
    ),
  );
  fireEvent.change(screen.getByLabelText("operation"), {
    target: { value: "both" },
  });
  fireEvent.change(screen.getByLabelText("state"), {
    target: { value: "reserved" },
  });
  fireEvent.change(screen.getByLabelText("city"), {
    target: { value: "Rosario" },
  });
  fireEvent.change(screen.getByLabelText("order"), {
    target: { value: "address" },
  });
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "photos" }));
  expect(screen.getByRole("article")).toHaveTextContent("Casa Los Aromos");
  expect(window.location.search).toContain("view=photos");
  fireEvent.click(screen.getByRole("button", { name: "list" }));
  expect(screen.getByRole("table")).toBeInTheDocument();
});
it("reports a failed read with explicit recovery and distinguishes empty data", async () => {
  api.getPage
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
  mockRole = "owner";
  render(<PropertiesPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("error");
  expect(screen.queryByRole("link", { name: "new" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("empty");
  expect(api.getPage).toHaveBeenCalledTimes(2);
});
