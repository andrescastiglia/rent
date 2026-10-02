import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ResultPage from "./page";
import { propertiesApi } from "@/lib/api/properties";
import type { User } from "@/types/auth";
let mockLoading = false;
let mockIds: { id: string | string[]; visitId: string | string[] } = {
  id: "property",
  visitId: "visit",
};
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
jest.mock("next/navigation", () => ({ useParams: () => mockIds }));
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
  propertiesApi: {
    getById: jest.fn(),
    getVisits: jest.fn(),
    updateVisitResult: jest.fn(),
  },
}));
const api = jest.mocked(propertiesApi);
const visit = { id: "visit", interestedName: "Ana Pérez", result: "pending" };
beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  mockIds = { id: "property", visitId: "visit" };
  mockUser = {
    id: "admin",
    role: "admin",
    firstName: "A",
    lastName: "B",
    email: null,
  };
  api.getById.mockResolvedValue({
    id: "property",
    name: "Casa Centro",
  } as never);
  api.getVisits.mockResolvedValue([visit] as never);
  api.updateVisitResult.mockResolvedValue({
    ...visit,
    result: "interested",
  } as never);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
const mount = async () => {
  const view = render(<ResultPage />);
  await screen.findByRole("button", { name: "submit" });
  return view;
};
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = (container: HTMLElement) =>
  fireEvent.submit(container.querySelector("form")!);

it("waits for authentication and selects the exact visit from a route array", async () => {
  mockLoading = true;
  mockIds = { id: ["property", "ignored"], visitId: ["visit", "ignored"] };
  const view = render(<ResultPage />);
  expect(api.getVisits).not.toHaveBeenCalled();
  mockLoading = false;
  view.rerender(<ResultPage />);
  await screen.findByText(/Casa Centro · Ana Pérez/);
  expect(api.getVisits).toHaveBeenCalledWith("property");
  expect(screen.getByRole("link", { name: "back" })).toHaveAttribute(
    "href",
    "/es/properties/property",
  );
});

it("submits a visit outcome with trimmed comments and returns to the property", async () => {
  const { container } = await mount();
  change("reason", " Coordinar seguimiento ");
  submit(container);
  await waitFor(() =>
    expect(api.updateVisitResult).toHaveBeenCalledWith("property", "visit", {
      result: "interested",
      reason: "Coordinar seguimiento",
      offerAmount: undefined,
      offerCurrency: undefined,
    }),
  );
  expect(mockPush).toHaveBeenCalledWith("/properties/property");
  expect(mockRefresh).toHaveBeenCalled();
});

it("requires an explained lack of interest before submitting", async () => {
  const { container } = await mount();
  change("result", "not_interested");
  submit(container);
  expect(screen.getByRole("alert")).toHaveTextContent("reasonRequired");
  expect(api.updateVisitResult).not.toHaveBeenCalled();
  change("reason", " Precio elevado ");
  submit(container);
  await waitFor(() =>
    expect(api.updateVisitResult).toHaveBeenCalledWith(
      "property",
      "visit",
      expect.objectContaining({
        result: "not_interested",
        reason: "Precio elevado",
      }),
    ),
  );
});

it("validates offer amounts and preserves the chosen currency and decimal cents", async () => {
  const { container } = await mount();
  change("result", "offer");
  submit(container);
  expect(screen.getByRole("alert")).toHaveTextContent("invalidOffer");
  change("offerAmount", "0");
  submit(container);
  expect(api.updateVisitResult).not.toHaveBeenCalled();
  change("offerAmount", "1250.75");
  change("offerCurrency", "USD");
  submit(container);
  await waitFor(() =>
    expect(api.updateVisitResult).toHaveBeenCalledWith("property", "visit", {
      result: "offer",
      reason: undefined,
      offerAmount: 1250.75,
      offerCurrency: "USD",
    }),
  );
});

it("loads the existing outcome rather than silently replacing a historical offer", async () => {
  api.getVisits.mockResolvedValueOnce([
    {
      ...visit,
      result: "offer",
      resultReason: "Oferta previa",
      offerAmount: 925.5,
      offerCurrency: "USD",
      interestedName: null,
    },
  ] as never);
  await mount();
  expect(screen.getByLabelText("result")).toHaveValue("offer");
  expect(screen.getByLabelText("reason")).toHaveValue("Oferta previa");
  expect(screen.getByLabelText("offerAmount")).toHaveValue(925.5);
  expect(screen.getByLabelText("offerCurrency")).toHaveValue("USD");
  expect(screen.getByText(/Casa Centro · prospect/)).toBeInTheDocument();
});

it.each(["property", "visit"])(
  "shows a missing %s separately from a failed lookup",
  async (missing) => {
    if (missing === "property") api.getById.mockResolvedValueOnce(null);
    else
      api.getVisits.mockResolvedValueOnce([
        { ...visit, id: "unrelated" },
      ] as never);
    render(<ResultPage />);
    await screen.findByText("notFound");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "submit" }),
    ).not.toBeInTheDocument();
  },
);

it("surfaces a failed read and retries the same property and visit only explicitly", async () => {
  api.getVisits.mockRejectedValueOnce(new Error("offline"));
  render(<ResultPage />);
  await screen.findByRole("alert");
  expect(screen.queryByText("notFound")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByRole("button", { name: "submit" });
  expect(api.getVisits).toHaveBeenCalledTimes(2);
});

it("retains the user's result after a failed save and does not retry automatically", async () => {
  api.updateVisitResult.mockRejectedValueOnce(new Error("lost response"));
  const { container } = await mount();
  change("reason", "Revisar antes de enviar");
  submit(container);
  await screen.findByRole("alert");
  expect(screen.getByLabelText("reason")).toHaveValue(
    "Revisar antes de enviar",
  );
  expect(mockPush).not.toHaveBeenCalled();
  expect(api.updateVisitResult).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(mockBack).toHaveBeenCalled();
});

it.each(["owner", "tenant", "buyer", "staff"] as const)(
  "keeps %s without property permission out of result mutations",
  async (role) => {
    mockUser = { ...mockUser, role, permissions: { properties: false } };
    render(<ResultPage />);
    await screen.findByText("accessDeniedMessage");
    expect(api.getById).not.toHaveBeenCalled();
    expect(api.getVisits).not.toHaveBeenCalled();
  },
);

it("suppresses stale reads after navigation away", async () => {
  let finish:
    | ((value: Awaited<ReturnType<typeof propertiesApi.getVisits>>) => void)
    | undefined;
  api.getVisits.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<ResultPage />);
  view.unmount();
  await act(async () => {
    finish?.([]);
  });
  expect(screen.queryByText("notFound")).not.toBeInTheDocument();
});
