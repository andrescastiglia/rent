import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Page from "./page";
import { interestedApi } from "@/lib/api/interested";

const mockTranslate = (key: string) => key;
const mockPush = jest.fn(),
  mockRefresh = jest.fn();
let mockParams: { id?: string | string[] };
let mockAuthLoading = false;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({ useParams: () => mockParams }));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: mockAuthLoading }),
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));
jest.mock("@/lib/api/interested", () => ({
  interestedApi: { getSummary: jest.fn(), update: jest.fn() },
}));
const api = jest.mocked(interestedApi);
const profile = {
  id: "person",
  firstName: "Ana",
  lastName: "Pérez",
  phone: "123",
  email: "ana@example.com",
  operation: "rent",
  operations: ["rent"],
  propertyTypePreference: "apartment",
  peopleCount: 2,
  minAmount: 100,
  maxAmount: 500,
  verifiedMonthlyIncome: 1000,
  hasPets: true,
  preferredCity: "Córdoba",
  desiredFeatures: ["balcón"],
  status: "active",
  qualificationLevel: "qualified",
  source: "office",
  consentContact: false,
  notes: "Existing",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: "person" };
  mockAuthLoading = false;
  api.getSummary.mockResolvedValue({ profile } as never);
  api.update.mockResolvedValue(profile as never);
  jest.spyOn(window, "alert").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
async function mount() {
  render(<Page />);
  await screen.findByRole("heading", { name: "editTitle" });
}
const change = (field: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(`fields.${field}`), {
    target: { value },
  });
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "actions.save" }));

it("loads array route IDs and preserves profile metadata while normalizing edits", async () => {
  mockParams = { id: ["person", "ignored"] };
  await mount();
  expect(api.getSummary).toHaveBeenCalledWith("person");
  expect(screen.getByRole("link", { name: "back" })).toHaveAttribute(
    "href",
    "/es/interested",
  );
  change("firstName", " New ");
  change("lastName", " Name ");
  change("phone", " 456 ");
  change("email", "new@example.com");
  change("peopleCount", "3");
  change("minAmount", "200");
  change("maxAmount", "900");
  change("verifiedMonthlyIncome", "2000");
  change("preferredCity", " Rosario ");
  change("desiredFeatures", " cochera, , patio ");
  change("notes", " Changed ");
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "house" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.sale" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "fields.hasPets" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "fields.consentContact" }),
  );
  save();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/interested"));
  expect(api.update).toHaveBeenCalledWith(
    "person",
    expect.objectContaining({
      firstName: "New",
      lastName: "Name",
      phone: "456",
      email: "new@example.com",
      peopleCount: 3,
      minAmount: 200,
      maxAmount: 900,
      verifiedMonthlyIncome: 2000,
      preferredCity: "Rosario",
      desiredFeatures: ["cochera", "patio"],
      notes: "Changed",
      operations: ["rent", "sale"],
      propertyTypePreference: "house",
      hasPets: false,
      consentContact: true,
      consentRecordedAt: expect.any(Date),
      status: "active",
      qualificationLevel: "qualified",
      source: "office",
    }),
  );
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it("uses legacy operation and optional-value fallbacks instead of inventing profile details", async () => {
  api.getSummary.mockResolvedValue({
    profile: { id: "person", phone: "123", operation: "sale" },
  } as never);
  await mount();
  expect(
    screen.getByRole("checkbox", { name: "operations.sale" }),
  ).toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: "operations.rent" }),
  ).not.toBeChecked();
  expect(screen.getByPlaceholderText("fields.firstName")).toHaveValue("");
  expect(screen.getByRole("combobox")).toHaveValue("apartment");
  save();
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(
      "person",
      expect.objectContaining({
        operations: ["sale"],
        operation: "sale",
        firstName: undefined,
        lastName: undefined,
        email: undefined,
        preferredCity: undefined,
        notes: undefined,
        desiredFeatures: [],
        hasPets: false,
      }),
    ),
  );
});

it.each([
  [{ operations: ["sale"] }, "sale"],
  [{}, "rent"],
])("loads profiles with operation fallback %#", async (values, expected) => {
  api.getSummary.mockResolvedValue({
    profile: { id: "person", phone: "123", ...values },
  } as never);
  await mount();
  expect(
    screen.getByRole("checkbox", { name: `operations.${expected}` }),
  ).toBeChecked();
});

it("requires a phone and preserves edited values without contacting the API", async () => {
  await mount();
  change("phone", "   ");
  save();
  expect(window.alert).toHaveBeenCalledWith("errors.phoneRequired");
  expect(api.update).not.toHaveBeenCalled();
});

it("clears optional fields, revokes consent and keeps the default operation valid", async () => {
  await mount();
  for (const field of [
    "peopleCount",
    "minAmount",
    "maxAmount",
    "verifiedMonthlyIncome",
    "firstName",
    "lastName",
    "email",
    "preferredCity",
    "notes",
    "desiredFeatures",
  ])
    change(field, "");
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.rent" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.sale" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.sale" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "fields.consentContact" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "fields.consentContact" }),
  );
  save();
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(
      "person",
      expect.objectContaining({
        operations: ["rent"],
        peopleCount: undefined,
        minAmount: undefined,
        maxAmount: undefined,
        verifiedMonthlyIncome: undefined,
        firstName: undefined,
        lastName: undefined,
        email: undefined,
        preferredCity: undefined,
        notes: undefined,
        desiredFeatures: [],
        consentContact: false,
        consentRecordedAt: undefined,
      }),
    ),
  );
});

it("waits for authentication and a route ID before loading the profile", async () => {
  mockAuthLoading = true;
  const view = render(<Page />);
  expect(api.getSummary).not.toHaveBeenCalled();
  mockAuthLoading = false;
  mockParams = {};
  view.rerender(<Page />);
  expect(api.getSummary).not.toHaveBeenCalled();
  mockParams = { id: "person" };
  view.rerender(<Page />);
  await screen.findByRole("heading", { name: "editTitle" });
  expect(api.getSummary).toHaveBeenCalledTimes(1);
});

it("keeps edits and allows retry after a failed save, while preventing double submissions", async () => {
  let reject!: (reason: Error) => void;
  api.update.mockReturnValueOnce(
    new Promise((_resolve, failure) => {
      reject = failure;
    }),
  );
  await mount();
  change("firstName", "Kept");
  save();
  expect(screen.getByRole("button", { name: "actions.saving" })).toBeDisabled();
  await act(async () => reject(new Error("offline")));
  expect(window.alert).toHaveBeenCalledWith("error");
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByPlaceholderText("fields.firstName")).toHaveValue("Kept");
  save();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/interested"));
});

it("distinguishes failed reads from missing profiles and retries the existing ID", async () => {
  api.getSummary.mockRejectedValueOnce(new Error("not found"));
  render(<Page />);
  expect(
    await screen.findByRole("heading", { name: "errors.load" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "back" })).toHaveAttribute(
    "href",
    "/es/interested",
  );
  expect(api.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByRole("heading", { name: "editTitle" });
  expect(api.getSummary).toHaveBeenCalledTimes(2);
});
