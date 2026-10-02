import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import PortalLayout from "./layout";
import OwnerLayout from "./owner/layout";
import TenantLayout from "./tenant/layout";
let mockUser: {
  id: string;
  companyId?: string;
  role: string;
  roles?: string[];
  firstName?: string;
  lastName?: string;
} | null;
let mockLoading = false;
let mockPath = "/es/portal/owner";
const mockReplace = jest.fn();
const mockLogout = jest.fn();
const mockRouter = { replace: mockReplace };
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
jest.mock("next/navigation", () => ({ usePathname: () => mockPath }));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: mockLoading, logout: mockLogout }),
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => mockRouter,
}));
jest.mock("@/components/common/ContextualGuidance", () => ({
  __esModule: true,
  default: ({ rootId }: { rootId: string }) => (
    <aside data-testid="help" data-root={rootId}>
      Ayuda contextual
    </aside>
  ),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = false;
  mockPath = "/es/portal/owner";
  mockUser = {
    id: "owner",
    role: "owner",
    firstName: "Ana",
    lastName: "Pérez",
  };
});
it("waits for authentication and redirects unauthenticated access without rendering portal children", async () => {
  mockLoading = true;
  mockUser = null;
  const view = render(
    <PortalLayout>
      <p>Privado</p>
    </PortalLayout>,
  );
  expect(screen.queryByText("Privado")).not.toBeInTheDocument();
  expect(mockReplace).not.toHaveBeenCalled();
  mockLoading = false;
  view.rerender(
    <PortalLayout>
      <p>Privado</p>
    </PortalLayout>,
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(screen.queryByTestId("help")).not.toBeInTheDocument();
});
it("registers assistance around authenticated portal content", () => {
  render(
    <PortalLayout>
      <p>Privado</p>
    </PortalLayout>,
  );
  expect(
    screen.getByText("Privado").closest("#portal-content"),
  ).toBeInTheDocument();
  expect(screen.getByTestId("help")).toHaveAttribute(
    "data-root",
    "portal-content",
  );
});
it.each(["id", "companyId"] as const)(
  "clears previous portal data and subscriptions when the actor %s changes",
  (field) => {
    const cleanup = jest.fn();
    const load = jest.fn();
    function PrivatePage() {
      const [draft, setDraft] = useState("");
      useEffect(() => {
        load(mockUser?.id, mockUser?.companyId);
        return cleanup;
      }, []);
      return (
        <input
          aria-label="Private draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      );
    }
    mockUser = { id: "first", companyId: "company", role: "buyer" };
    const view = render(
      <PortalLayout>
        <PrivatePage />
      </PortalLayout>,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Previous actor's data" },
    });
    view.rerender(
      <PortalLayout>
        <PrivatePage />
      </PortalLayout>,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Previous actor's data");
    expect(load).toHaveBeenCalledTimes(1);
    mockUser = { ...mockUser, [field]: "second" };
    view.rerender(
      <PortalLayout>
        <PrivatePage />
      </PortalLayout>,
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenLastCalledWith(mockUser.id, mockUser.companyId);
  },
);
it("marks the exact owner home and nested authorized owner routes correctly", () => {
  const view = render(
    <OwnerLayout>
      <p>Propiedades propias</p>
    </OwnerLayout>,
  );
  expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "nav.home" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    screen.getByRole("link", { name: "nav.properties" }),
  ).not.toHaveAttribute("aria-current");
  mockPath = "/es/portal/owner/properties/own-property";
  view.rerender(
    <OwnerLayout>
      <p>Propiedades propias</p>
    </OwnerLayout>,
  );
  expect(screen.getByRole("link", { name: "nav.properties" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "nav.home" })).not.toHaveAttribute(
    "aria-current",
  );
  expect(screen.getByRole("link", { name: "nav.maintenance" })).toHaveAttribute(
    "href",
    "/es/portal/owner/maintenance",
  );
});
it("allows a multirole owner and refuses unrelated roles or absent users", async () => {
  mockUser = { id: "actor", role: "tenant", roles: ["tenant", "owner"] };
  const view = render(
    <OwnerLayout>
      <p>Privado propietario</p>
    </OwnerLayout>,
  );
  expect(screen.getByText("Privado propietario")).toBeInTheDocument();
  mockUser = { id: "actor", role: "tenant" };
  view.rerender(
    <OwnerLayout>
      <p>Privado propietario</p>
    </OwnerLayout>,
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(screen.queryByText("Privado propietario")).not.toBeInTheDocument();
  mockUser = null;
  view.rerender(
    <OwnerLayout>
      <p>Privado propietario</p>
    </OwnerLayout>,
  );
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
it("provides tenant navigation and explicit logout, with exact and nested active links", () => {
  mockUser = {
    id: "tenant",
    role: "tenant",
    firstName: "Ana",
    lastName: "Pérez",
  };
  mockPath = "/es/portal/tenant";
  const view = render(
    <TenantLayout>
      <p>Resumen propio</p>
    </TenantLayout>,
  );
  expect(screen.getByRole("link", { name: "dashboard" })).toHaveClass(
    "text-blue-600",
  );
  expect(screen.getByRole("link", { name: "myContract" })).toHaveAttribute(
    "href",
    "/es/portal/tenant/contract",
  );
  mockPath = "/es/portal/tenant/payments/receipt";
  view.rerender(
    <TenantLayout>
      <p>Resumen propio</p>
    </TenantLayout>,
  );
  expect(screen.getByRole("link", { name: "myPayments" })).toHaveClass(
    "text-blue-600",
  );
  expect(screen.getByRole("link", { name: "dashboard" })).toHaveClass(
    "text-gray-500",
  );
  fireEvent.click(screen.getByRole("button", { name: "logout" }));
  expect(mockLogout).toHaveBeenCalledTimes(1);
});
it("does not render tenant content while loading, unauthenticated or unauthorized", async () => {
  mockLoading = true;
  const view = render(
    <TenantLayout>
      <p>Privado inquilino</p>
    </TenantLayout>,
  );
  expect(screen.queryByText("Privado inquilino")).not.toBeInTheDocument();
  expect(mockReplace).not.toHaveBeenCalled();
  mockLoading = false;
  mockUser = null;
  view.rerender(
    <TenantLayout>
      <p>Privado inquilino</p>
    </TenantLayout>,
  );
  await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith("/login"));
  mockUser = { id: "owner", role: "owner" };
  view.rerender(
    <TenantLayout>
      <p>Privado inquilino</p>
    </TenantLayout>,
  );
  await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith("/"));
  expect(screen.queryByText("Privado inquilino")).not.toBeInTheDocument();
});
