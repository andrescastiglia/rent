import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "./login/page";
import RegisterPage from "./register/page";
import AuthLayout from "./layout";

const mockLogin = jest.fn();
const mockRegister = jest.fn();
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ login: mockLogin, register: mockRegister }),
}));
jest.mock("@/components/ui/LanguageSelector", () => ({
  __esModule: true,
  default: () => <div>Elegir idioma</div>,
}));
jest.mock("@/components/common/TurnstileCaptcha", () => ({
  TurnstileCaptcha: ({
    onTokenChange,
  }: {
    onTokenChange: (token: string | null) => void;
  }) => (
    <>
      <button type="button" onClick={() => onTokenChange("captcha-token")}>
        Resolver captcha
      </button>
      <button type="button" onClick={() => onTokenChange(null)}>
        Expirar captcha
      </button>
    </>
  ),
}));
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
function loginFields() {
  change("email", "ana@example.test");
  change("password", "Password123");
}
function registerFields() {
  change("firstName", "Ana");
  change("lastName", "Pérez");
  change("email", "ana@example.test");
  change("password", "Password123");
  change("confirmPassword", "Password123");
}
beforeEach(() => {
  jest.clearAllMocks();
  mockLogin.mockResolvedValue(undefined);
  mockRegister.mockResolvedValue({ pendingApproval: true });
  delete process.env.NEXT_PUBLIC_LOCAL_DEV_CAPTCHA_BYPASS;
});

it("submits explicit login credentials, toggles password visibility and links to localized registration", async () => {
  render(<LoginPage />);
  loginFields();
  fireEvent.click(screen.getByRole("button", { name: "showPassword" }));
  expect(screen.getByLabelText("password")).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "hidePassword" }));
  expect(screen.getByLabelText("password")).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "login" }));
  await waitFor(() =>
    expect(mockLogin).toHaveBeenCalledWith({
      email: "ana@example.test",
      password: "Password123",
      captchaToken: undefined,
    }),
  );
  expect(screen.getByRole("link", { name: "register" })).toHaveAttribute(
    "href",
    "/es/register",
  );
});
it("requires a fresh captcha after invalid credentials and preserves credentials on retry", async () => {
  mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));
  render(<LoginPage />);
  loginFields();
  fireEvent.click(screen.getByRole("button", { name: "login" }));
  await screen.findByText("errors.invalidCredentials");
  expect(screen.getByLabelText("email")).toHaveValue("ana@example.test");
  fireEvent.click(screen.getByRole("button", { name: "login" }));
  await screen.findByText("errors.captchaRequired");
  expect(mockLogin).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Resolver captcha" }));
  fireEvent.click(screen.getByRole("button", { name: "Expirar captcha" }));
  fireEvent.click(screen.getByRole("button", { name: "login" }));
  expect(mockLogin).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Resolver captcha" }));
  fireEvent.click(screen.getByRole("button", { name: "login" }));
  await waitFor(() =>
    expect(mockLogin).toHaveBeenLastCalledWith(
      expect.objectContaining({ captchaToken: "captcha-token" }),
    ),
  );
});
it.each([
  ["user.blocked", "errors.blocked"],
  ["CAPTCHA_REQUIRED", "errors.captchaRequired"],
  ["CAPTCHA_INVALID", "errors.captchaInvalid"],
  ["CAPTCHA_NOT_CONFIGURED", "errors.captchaUnavailable"],
  ["offline", "offline"],
])("shows the actionable login error %s", async (message, expected) => {
  mockLogin.mockRejectedValueOnce(new Error(message));
  render(<LoginPage />);
  loginFields();
  fireEvent.click(screen.getByRole("button", { name: "login" }));
  await screen.findByText(expected);
});
it("handles unknown login failures and respects configured local captcha bypass", async () => {
  process.env.NEXT_PUBLIC_LOCAL_DEV_CAPTCHA_BYPASS = "true";
  mockLogin.mockRejectedValueOnce("unknown");
  render(<LoginPage />);
  loginFields();
  fireEvent.click(screen.getByRole("button", { name: "login" }));
  await screen.findByText("errors.loginError");
  expect(
    screen.queryByRole("button", { name: "Resolver captcha" }),
  ).not.toBeInTheDocument();
});
it("blocks registration mismatches, short passwords and absent captcha without writing to the API", async () => {
  render(<RegisterPage />);
  registerFields();
  change("confirmPassword", "different");
  fireEvent.click(screen.getByRole("button", { name: "createAccount" }));
  await screen.findByText("errors.passwordMismatch");
  change("password", "short");
  change("confirmPassword", "short");
  fireEvent.click(screen.getByRole("button", { name: "createAccount" }));
  await screen.findByText("errors.passwordTooShort");
  change("password", "Password123");
  change("confirmPassword", "Password123");
  fireEvent.click(screen.getByRole("button", { name: "createAccount" }));
  await screen.findByText("errors.captchaRequired");
  expect(mockRegister).not.toHaveBeenCalled();
});
it("registers the chosen external role and waits for approval, without sending confirmPassword", async () => {
  render(<RegisterPage />);
  registerFields();
  change("role", "owner");
  change("phone", "+5491112345678");
  fireEvent.click(screen.getAllByRole("button", { name: "showPassword" })[0]);
  expect(screen.getByLabelText("password")).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "hidePassword" }));
  fireEvent.click(screen.getAllByRole("button", { name: "showPassword" })[1]);
  expect(screen.getByLabelText("confirmPassword")).toHaveAttribute(
    "type",
    "text",
  );
  fireEvent.click(screen.getByRole("button", { name: "hidePassword" }));
  fireEvent.click(screen.getByRole("button", { name: "Resolver captcha" }));
  fireEvent.click(screen.getByRole("button", { name: "createAccount" }));
  await screen.findByText("messages.pendingApproval");
  expect(mockRegister).toHaveBeenCalledWith({
    firstName: "Ana",
    lastName: "Pérez",
    email: "ana@example.test",
    phone: "+5491112345678",
    password: "Password123",
    role: "owner",
    captchaToken: "captcha-token",
  });
  expect(screen.getByRole("link", { name: "login" })).toHaveAttribute(
    "href",
    "/es/login",
  );
});
it.each([
  ["Email already exists", "errors.emailAlreadyRegistered"],
  ["CAPTCHA_REQUIRED", "errors.captchaRequired"],
  ["CAPTCHA_INVALID", "errors.captchaInvalid"],
  ["CAPTCHA_NOT_CONFIGURED", "errors.captchaUnavailable"],
  ["offline", "offline"],
  [null, "errors.registerError"],
])(
  "preserves the registration form after error %s",
  async (message, expected) => {
    mockRegister.mockRejectedValueOnce(
      message === null ? "unknown" : new Error(message),
    );
    render(<RegisterPage />);
    registerFields();
    fireEvent.click(screen.getByRole("button", { name: "Resolver captcha" }));
    fireEvent.click(screen.getByRole("button", { name: "createAccount" }));
    await screen.findByText(expected);
    expect(screen.getByLabelText("firstName")).toHaveValue("Ana");
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ phone: undefined, role: "tenant" }),
    );
  },
);
it("allows immediate registration success without a false pending-approval message", async () => {
  mockRegister.mockResolvedValueOnce({ pendingApproval: false });
  render(<RegisterPage />);
  registerFields();
  fireEvent.click(screen.getByRole("button", { name: "Resolver captcha" }));
  fireEvent.click(screen.getByRole("button", { name: "createAccount" }));
  await waitFor(() => expect(mockRegister).toHaveBeenCalled());
  expect(
    screen.queryByText("messages.pendingApproval"),
  ).not.toBeInTheDocument();
});
it("keeps language selection available around authentication content", () => {
  render(
    <AuthLayout>
      <p>Acceso</p>
    </AuthLayout>,
  );
  expect(screen.getByText("Acceso")).toBeInTheDocument();
  expect(screen.getByText("Elegir idioma")).toBeInTheDocument();
});
