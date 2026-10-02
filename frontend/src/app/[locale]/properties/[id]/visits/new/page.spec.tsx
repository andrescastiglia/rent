import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VisitPage from "./page";
import { propertiesApi } from "@/lib/api/properties";
import { interestedApi } from "@/lib/api/interested";
import type { User } from "@/types/auth";
let mockLoading = false;
let mockId: string | string[] = "property";
let mockUser: User = {
  id: "admin",
  role: "admin",
  firstName: "A",
  lastName: "B",
  email: null,
};
const mockPush = jest.fn(),
  mockRefresh = jest.fn(),
  mockBack = jest.fn();
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
jest.mock("next/navigation", () => ({ useParams: () => ({ id: mockId }) }));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: mockLoading, user: mockUser }),
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
    back: mockBack,
  }),
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getById: jest.fn(), createVisit: jest.fn() },
}));
jest.mock("@/lib/api/interested", () => ({
  interestedApi: { getAll: jest.fn() },
}));
const propertyApi = jest.mocked(propertiesApi),
  profileApi = jest.mocked(interestedApi);
beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  mockId = "property";
  mockUser = {
    id: "admin",
    role: "admin",
    firstName: "A",
    lastName: "B",
    email: null,
  };
  propertyApi.getById.mockResolvedValue({
    id: "property",
    name: "Casa Centro",
    operations: ["rent"],
  } as never);
  propertyApi.createVisit.mockResolvedValue({ id: "visit" } as never);
  profileApi.getAll.mockResolvedValue({
    data: [{ id: "profile", firstName: "Ana", lastName: "Pérez" }],
    page: 1,
    total: 1,
    limit: 100,
  } as never);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
const mount = async () => {
  const view = render(<VisitPage />);
  await screen.findByRole("button", { name: "visitForm.title" });
  return view;
};
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
const submit = (container: HTMLElement) =>
  fireEvent.submit(container.querySelector("form")!);

it("waits for authentication and loads every prospect page for the property operation", async () => {
  mockLoading = true;
  mockId = ["property", "ignored"];
  profileApi.getAll.mockImplementation(
    async (filters) =>
      ({
        data: [
          {
            id: `profile-${filters?.page}`,
            firstName: filters?.page === 1 ? "Ana" : "Nora",
            lastName: "Pérez",
          },
        ],
        total: 2,
        page: filters?.page,
        limit: 1,
      }) as never,
  );
  const view = render(<VisitPage />);
  expect(propertyApi.getById).not.toHaveBeenCalled();
  mockLoading = false;
  view.rerender(<VisitPage />);
  await screen.findByRole("option", { name: "Nora Pérez" });
  expect(profileApi.getAll).toHaveBeenCalledWith({
    operation: "rent",
    page: 2,
    limit: 100,
  });
});

it("registers a visit for the selected prospect with a calendar date and optional comments", async () => {
  const { container } = await mount();
  change("visitForm.registeredPerson", "profile");
  expect(screen.getByLabelText("visitForm.person")).toBeDisabled();
  change("visitForm.date", "2026-10-03");
  change("visitForm.comments", " Coordinar seguimiento ");
  submit(container);
  await waitFor(() =>
    expect(propertyApi.createVisit).toHaveBeenCalledWith(
      "property",
      expect.objectContaining({
        visitedAt: "2026-10-03",
        interestedName: "Ana Pérez",
        interestedProfileId: "profile",
        comments: "Coordinar seguimiento",
        hasOffer: false,
        offerAmount: undefined,
        offerCurrency: undefined,
      }),
    ),
  );
  expect(mockPush).toHaveBeenCalledWith("/properties/property");
  expect(mockRefresh).toHaveBeenCalled();
});

it("registers a positive offer in its own currency and keeps manual naming editable", async () => {
  const { container } = await mount();
  change("visitForm.person", " Interesado nuevo ");
  fireEvent.click(screen.getByLabelText("visitForm.hasOffer"));
  change("visitForm.offerAmount", "1250.75");
  change("visitForm.currency", "USD");
  submit(container);
  await waitFor(() =>
    expect(propertyApi.createVisit).toHaveBeenCalledWith(
      "property",
      expect.objectContaining({
        interestedName: "Interesado nuevo",
        interestedProfileId: undefined,
        offerAmount: 1250.75,
        offerCurrency: "USD",
      }),
    ),
  );
});

it("does not submit incomplete names, dates, or nonpositive offers", async () => {
  const { container } = await mount();
  submit(container);
  expect(screen.getByRole("alert")).toHaveTextContent("visitForm.nameRequired");
  change("visitForm.person", "Ana");
  change("visitForm.date", "");
  submit(container);
  expect(screen.getByRole("alert")).toHaveTextContent("visitForm.invalidDate");
  change("visitForm.date", "2026-10-03");
  fireEvent.click(screen.getByLabelText("visitForm.hasOffer"));
  change("visitForm.offerAmount", "-1");
  submit(container);
  expect(screen.getByRole("alert")).toHaveTextContent("visitForm.invalidOffer");
  expect(propertyApi.createVisit).not.toHaveBeenCalled();
});

it("allows a user to leave a selection and retains the visitor name", async () => {
  await mount();
  change("visitForm.registeredPerson", "profile");
  change("visitForm.registeredPerson", "");
  expect(screen.getByLabelText("visitForm.person")).toBeEnabled();
  expect(screen.getByLabelText("visitForm.person")).toHaveValue("Ana Pérez");
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(mockBack).toHaveBeenCalled();
});

it("distinguishes a lookup failure from a missing property and explicitly retries", async () => {
  propertyApi.getById.mockRejectedValueOnce(new Error("offline"));
  render(<VisitPage />);
  await screen.findByRole("alert");
  expect(screen.queryByText("notFound")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByRole("button", { name: "visitForm.title" });
  expect(propertyApi.getById).toHaveBeenCalledTimes(2);
});

it("does not permit visits when the prospect collection is incomplete", async () => {
  profileApi.getAll.mockRejectedValueOnce(new Error("offline"));
  render(<VisitPage />);
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "visitForm.title" }),
  ).not.toBeInTheDocument();
  expect(propertyApi.createVisit).not.toHaveBeenCalled();
});

it("shows a missing property without fetching prospects", async () => {
  propertyApi.getById.mockResolvedValueOnce(null);
  render(<VisitPage />);
  await screen.findByText("notFound");
  expect(profileApi.getAll).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "backToList" })).toHaveAttribute(
    "href",
    "/es/properties",
  );
});

it.each(["owner", "tenant", "buyer", "staff"] as const)(
  "blocks a %s deep link without the property mutation capability",
  async (role) => {
    mockUser = { ...mockUser, role, permissions: { properties: false } };
    render(<VisitPage />);
    await screen.findByText("accessDeniedMessage");
    expect(propertyApi.getById).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "visitForm.title" }),
    ).not.toBeInTheDocument();
  },
);

it("surfaces an uncertain save, keeps fields, and retries only by user action", async () => {
  propertyApi.createVisit.mockRejectedValueOnce(new Error("lost"));
  const { container } = await mount();
  change("visitForm.person", "Ana");
  submit(container);
  await screen.findByRole("alert");
  expect(screen.getByLabelText("visitForm.person")).toHaveValue("Ana");
  expect(mockPush).not.toHaveBeenCalled();
  expect(propertyApi.createVisit).toHaveBeenCalledTimes(1);
  submit(container);
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith("/properties/property"),
  );
  expect(propertyApi.createVisit).toHaveBeenCalledTimes(2);
});
