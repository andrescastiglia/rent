import { fireEvent, render, screen } from "@testing-library/react";
import Page from "./page";
import { usersApi } from "@/lib/api/users";
const mockTranslate = (key: string) => key;
const mockUpdate = jest.fn(),
  mockReplace = jest.fn();
let mockPath = "/es/settings",
  mockLoading = false;
let mockUser: Record<string, unknown> = {};
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockLoading,
    updateUser: mockUpdate,
  }),
}));
jest.mock("@/lib/api/users", () => ({
  usersApi: {
    getMyProfile: jest.fn(),
    updateMyProfile: jest.fn(),
    changeMyPassword: jest.fn(),
  },
}));
jest.mock("@/components/payments/FinancialSettingsPanel", () => () => (
  <output>financial-settings</output>
));
const api = jest.mocked(usersApi);
beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  mockPath = "/es/settings";
  mockUser = {
    id: "admin",
    role: "admin",
    firstName: "Ana",
    lastName: "Perez",
    email: "ana@example.com",
    language: "es",
    phone: "11",
  };
  api.getMyProfile.mockResolvedValue(mockUser as never);
  api.updateMyProfile.mockResolvedValue(mockUser as never);
  api.changeMyPassword.mockResolvedValue({} as never);
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const mount = async () => {
  const result = render(<Page />);
  await screen.findByLabelText("email");
  return result;
};
const submitProfile = () =>
  fireEvent.submit(screen.getByLabelText("email").closest("form")!);
const submitPassword = (container: HTMLElement) =>
  fireEvent.submit(container.querySelectorAll("form")[1]);
it("loads the current profile and shows admin integration and financial settings", async () => {
  await mount();
  expect(api.getMyProfile).toHaveBeenCalledTimes(1);
  expect(mockUpdate).toHaveBeenCalledWith(mockUser);
  expect(screen.getByLabelText("email")).toHaveValue("ana@example.com");
  expect(screen.getByText("financial-settings")).toBeVisible();
  expect(screen.getByRole("link", { name: /description/ })).toHaveAttribute(
    "href",
    "/es/settings/mercadolibre",
  );
});
it.each([
  ["email", "bad", "errors.invalidEmail"],
  ["firstName", " ", "errors.missingName"],
  ["lastName", "", "errors.missingName"],
])(
  "blocks invalid profile %s before a mutation",
  async (field, value, message) => {
    await mount();
    change(field, value);
    submitProfile();
    expect(screen.getByText(message)).toBeVisible();
    expect(api.updateMyProfile).not.toHaveBeenCalled();
  },
);
it.each(["/es/settings", "/es", "/unexpected"])(
  "saves trimmed fields, consent and switches the locale from %s",
  async (path) => {
    mockPath = path;
    await mount();
    change("email", " new@example.com ");
    change("firstName", " Maria ");
    change("lastName", " Lopez ");
    change("phone", " 123 ");
    change("avatarUrl", " https://example.com/avatar.png ");
    change("selectLanguage", "pt");
    fireEvent.click(screen.getByRole("checkbox"));
    submitProfile();
    await screen.findByText("messages.profileSaved");
    expect(api.updateMyProfile).toHaveBeenCalledWith({
      email: "new@example.com",
      firstName: "Maria",
      lastName: "Lopez",
      phone: "123",
      avatarUrl: "https://example.com/avatar.png",
      language: "pt",
      whatsappEnabled: true,
    });
    expect(mockReplace).toHaveBeenCalledWith(
      path === "/es" ? "/pt" : "/pt/settings",
    );
  },
);
it("keeps existing values visible when a profile read fails and communicates update failure", async () => {
  api.getMyProfile.mockRejectedValueOnce(new Error("offline"));
  api.updateMyProfile.mockRejectedValueOnce(new Error("conflict"));
  await mount();
  expect(screen.getByText("errors.loadProfile")).toBeVisible();
  submitProfile();
  await screen.findByText("errors.updateProfile");
  expect(mockReplace).not.toHaveBeenCalled();
});
it.each([
  ["", "", "", "errors.passwordRequired"],
  ["old", "short", "short", "errors.passwordTooShort"],
  ["old", "longEnough", "different", "errors.passwordMismatch"],
])(
  "validates passwords without sending %s/%s",
  async (current, next, confirm, message) => {
    const { container } = await mount();
    const inputs = container.querySelectorAll("input[type=password]");
    [current, next, confirm].forEach((value, index) =>
      fireEvent.change(inputs[index], { target: { value } }),
    );
    submitPassword(container);
    expect(screen.getByText(message)).toBeVisible();
    expect(api.changeMyPassword).not.toHaveBeenCalled();
  },
);
it("changes the password once, clears the secret fields and surfaces a later failure", async () => {
  const { container } = await mount();
  const fill = () =>
    container.querySelectorAll("input[type=password]").forEach((input, index) =>
      fireEvent.change(input, {
        target: { value: index === 0 ? "old" : "newLongEnough" },
      }),
    );
  fill();
  submitPassword(container);
  await screen.findByText("messages.passwordSaved");
  expect(api.changeMyPassword).toHaveBeenCalledWith({
    currentPassword: "old",
    newPassword: "newLongEnough",
  });
  container
    .querySelectorAll("input[type=password]")
    .forEach((input) => expect(input).toHaveValue(""));
  api.changeMyPassword.mockRejectedValueOnce(new Error("wrong"));
  fill();
  submitPassword(container);
  await screen.findByText("errors.updatePassword");
});
it("limits administrative settings for a tenant and retains a loading state during auth", async () => {
  mockUser = { id: "tenant", role: "tenant" };
  api.getMyProfile.mockResolvedValue(mockUser as never);
  await mount();
  expect(screen.queryByText("financial-settings")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /description/ }),
  ).not.toBeInTheDocument();
});
it("does not request a profile before authentication is ready", () => {
  mockLoading = true;
  const { container } = render(<Page />);
  expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  expect(api.getMyProfile).not.toHaveBeenCalled();
});
