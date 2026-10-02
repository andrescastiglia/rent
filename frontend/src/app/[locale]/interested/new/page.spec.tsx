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
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));
jest.mock("@/lib/api/interested", () => ({
  interestedApi: { create: jest.fn() },
}));
const api = jest.mocked(interestedApi);
beforeEach(() => {
  jest.clearAllMocks();
  api.create.mockResolvedValue({ id: "created" } as never);
  jest.spyOn(window, "alert").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const change = (field: string, value: string) =>
  fireEvent.change(screen.getByLabelText(`fields.${field}`), {
    target: { value },
  });
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "actions.save" }));

it("requires a phone without losing entered profile information", () => {
  render(<Page />);
  expect(screen.getByRole("link", { name: "back" })).toHaveAttribute(
    "href",
    "/es/interested",
  );
  change("firstName", "Ana");
  change("phone", "   ");
  save();
  expect(window.alert).toHaveBeenCalledWith("errors.phoneRequired");
  expect(api.create).not.toHaveBeenCalled();
  expect(screen.getByLabelText("fields.firstName")).toHaveValue("Ana");
});

it("normalizes contact information, multiple operations, budget and consent before saving", async () => {
  render(<Page />);
  change("firstName", " Ana ");
  change("lastName", " Pérez ");
  change("phone", " 123 ");
  change("email", "ana@example.com");
  change("peopleCount", "3");
  change("minAmount", "100.50");
  change("maxAmount", "500");
  change("verifiedMonthlyIncome", "2000");
  change("preferredCity", " Córdoba ");
  change("desiredFeatures", " balcón, , cochera ");
  change("notes", " Next month ");
  change("propertyType", "house");
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.sale" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "fields.hasPets" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "fields.consentContact" }),
  );
  change("preferredContactChannel", "email");
  save();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/interested"));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({
      firstName: "Ana",
      lastName: "Pérez",
      phone: "123",
      email: "ana@example.com",
      operations: ["rent", "sale"],
      operation: "rent",
      peopleCount: 3,
      minAmount: 100.5,
      maxAmount: 500,
      verifiedMonthlyIncome: 2000,
      preferredCity: "Córdoba",
      desiredFeatures: ["balcón", "cochera"],
      notes: "Next month",
      hasPets: true,
      propertyTypePreference: "house",
      consentContact: true,
      consentRecordedAt: expect.any(Date),
      preferredContactChannel: "email",
    }),
  );
});

it("clears optional amounts, revokes consent and restores the default when all operations are unchecked", async () => {
  render(<Page />);
  change("phone", "123");
  for (const field of [
    "peopleCount",
    "minAmount",
    "maxAmount",
    "verifiedMonthlyIncome",
  ]) {
    change(field, "10");
    change(field, "");
  }
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.rent" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.sale" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.sale" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "fields.consentContact" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "fields.consentContact" }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "fields.registeredInOffice" }),
  );
  expect(
    screen.queryByLabelText("fields.preferredContactChannel"),
  ).not.toBeInTheDocument();
  save();
  await waitFor(() => expect(api.create).toHaveBeenCalled());
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({
      firstName: undefined,
      lastName: undefined,
      email: undefined,
      preferredCity: undefined,
      notes: undefined,
      operation: "rent",
      operations: ["rent"],
      peopleCount: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      verifiedMonthlyIncome: undefined,
      consentContact: false,
      consentRecordedAt: undefined,
      registeredInOffice: false,
    }),
  );
});

it("allows a sale-only profile without creating a rental operation", async () => {
  render(<Page />);
  change("phone", "123");
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.sale" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "operations.rent" }));
  save();
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "sale", operations: ["sale"] }),
    ),
  );
});

it("disables duplicate submissions and preserves values when creation fails", async () => {
  let reject!: (error: Error) => void;
  api.create.mockReturnValueOnce(
    new Promise((_resolve, failure) => {
      reject = failure;
    }),
  );
  render(<Page />);
  change("phone", "123");
  change("firstName", "Ana");
  save();
  expect(screen.getByRole("button", { name: "actions.saving" })).toBeDisabled();
  await act(async () => reject(new Error("offline")));
  expect(window.alert).toHaveBeenCalledWith("error");
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByLabelText("fields.firstName")).toHaveValue("Ana");
  save();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/interested"));
});
