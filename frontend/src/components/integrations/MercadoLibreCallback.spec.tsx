import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MercadoLibreCallback } from "./MercadoLibreCallback";
import { useAuth } from "@/contexts/auth-context";
import { mercadoLibreApi } from "@/lib/api/mercadolibre";
import SettingsPage from "@/app/[locale]/settings/mercadolibre/page";

jest.mock("@/contexts/auth-context", () => ({ useAuth: jest.fn() }));
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock("@/lib/api/mercadolibre", () => ({
  ...jest.requireActual("@/lib/api/mercadolibre"),
  mercadoLibreApi: {
    status: jest.fn(),
    begin: jest.fn(),
    complete: jest.fn(),
    disconnect: jest.fn(),
  },
}));
const auth = jest.mocked(useAuth);
const api = jest.mocked(mercadoLibreApi);
const path = "/es/mercadolibre/callback";
function setUser(role: string | null, loading = false) {
  auth.mockReturnValue({
    user: role ? { id: "user", companyId: "company", role } : null,
    loading,
  } as ReturnType<typeof useAuth>);
}
beforeEach(() => {
  jest.resetAllMocks();
  setUser("admin");
  api.status.mockResolvedValue({
    enabled: true,
    status: "unconfigured",
    sellerId: null,
    expiresAt: null,
  });
  window.history.replaceState(
    null,
    "",
    `${path}?code=secret-code&state=${"a".repeat(43)}#extra`,
  );
});
afterEach(() => window.history.replaceState(null, "", "/"));
it("scrubs callback parameters and keeps the code in memory without automatic exchange", async () => {
  render(
    <StrictMode>
      <MercadoLibreCallback />
    </StrictMode>,
  );
  await screen.findByText("status.unconfigured");
  expect(window.location.pathname).toBe(path);
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("");
  expect(screen.queryByText("secret-code")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "complete" })).toBeEnabled();
  expect(api.complete).not.toHaveBeenCalled();
});
it.each(["owner", "staff", null])(
  "scrubs unauthorized callbacks without provider operations (%s)",
  async (role) => {
    setUser(role);
    render(<MercadoLibreCallback />);
    await screen.findByText("sessionRequired");
    expect(window.location.search).toBe("");
    expect(api.status).not.toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "back" })).toHaveAttribute(
      "href",
      role ? "/es/settings/mercadolibre" : "/es/login",
    );
  },
);
it("scrubs secrets while authentication loads, before any account request", async () => {
  setUser(null, true);
  const view = render(<MercadoLibreCallback />);
  expect(screen.getByRole("status")).toHaveTextContent("loading");
  expect(window.location.search).toBe("");
  expect(api.status).not.toHaveBeenCalled();
  setUser("admin");
  view.rerender(<MercadoLibreCallback />);
  await screen.findByText("status.unconfigured");
  expect(screen.getByRole("button", { name: "complete" })).toBeEnabled();
});
it("renders a neutral error for denied or malformed callbacks", async () => {
  window.history.replaceState(null, "", `${path}?error=secret-provider-error`);
  render(<MercadoLibreCallback />);
  await screen.findByText("invalidCallback");
  expect(screen.queryByText("secret-provider-error")).not.toBeInTheDocument();
  expect(api.complete).not.toHaveBeenCalled();
});
it.each(["owner", "staff"])(
  "guards the settings route for %s",
  async (role) => {
    setUser(role);
    render(<SettingsPage />);
    await screen.findByText("accessDenied");
    expect(api.status).not.toHaveBeenCalled();
  },
);
it("allows admin settings and clears stale status when the company changes", async () => {
  const view = render(<SettingsPage />);
  await screen.findByText("status.unconfigured");
  auth.mockReturnValue({
    user: { id: "user", companyId: "other", role: "admin" },
    loading: false,
  } as ReturnType<typeof useAuth>);
  api.status.mockResolvedValue({
    enabled: false,
    status: "disconnected",
    sellerId: null,
    expiresAt: null,
  });
  view.rerender(<SettingsPage />);
  await waitFor(() => expect(api.status).toHaveBeenCalledTimes(2));
  await screen.findByText("status.disconnected");
  expect(screen.queryByText("status.unconfigured")).not.toBeInTheDocument();
});
