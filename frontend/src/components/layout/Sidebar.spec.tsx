import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Sidebar from "./Sidebar";
let mockUser: { role: string } | null = { role: "admin" };
let mockDesktop = false;
let mockMediaChange: () => void;
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({ usePathname: () => "/es/properties" }));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser }),
}));
beforeEach(() => {
  mockUser = { role: "admin" };
  mockDesktop = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => ({
      get matches() {
        return mockDesktop;
      },
      addEventListener: (_event: string, handler: () => void) => {
        mockMediaChange = handler;
      },
      removeEventListener: jest.fn(),
    })),
  });
});
it("keeps the closed mobile menu inert and exposes grouped navigation on desktop", async () => {
  const { container } = render(<Sidebar />);
  const sidebar = container.querySelector("#app-sidebar")!;
  expect(sidebar).toHaveAttribute("inert");
  expect(sidebar).toHaveAttribute("aria-hidden", "true");
  mockDesktop = true;
  fireEvent(window, new Event("resize"));
  mockMediaChange();
  await waitFor(() => expect(sidebar).not.toHaveAttribute("inert"));
  expect(screen.getByRole("link", { name: "properties" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "owners" })).toHaveAttribute(
    "href",
    "/es/owners",
  );
  expect(
    screen.getByRole("navigation", { name: "groups.navigation" }),
  ).toBeInTheDocument();
});
it("traps mobile focus, closes by Escape and restores background and trigger focus", async () => {
  const close = jest.fn();
  const { container, rerender } = render(
    <>
      <button>Menu trigger</button>
      <div data-sidebar-background>Content</div>
      <Sidebar isOpen={false} onClose={close} />
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Menu trigger" });
  trigger.focus();
  rerender(
    <>
      <button>Menu trigger</button>
      <div data-sidebar-background>Content</div>
      <Sidebar isOpen onClose={close} />
    </>,
  );
  const sidebar = screen.getByRole("dialog", { name: "groups.navigation" });
  expect(container.querySelector("[data-sidebar-background]")).toHaveAttribute(
    "inert",
  );
  expect(document.body.style.overflow).toBe("hidden");
  const controls = sidebar.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex="0"]',
  );
  expect(controls[0]).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(controls[controls.length - 1]).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(controls[0]).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
  rerender(
    <>
      <button>Menu trigger</button>
      <div data-sidebar-background>Content</div>
      <Sidebar isOpen={false} onClose={close} />
    </>,
  );
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(
    container.querySelector("[data-sidebar-background]"),
  ).not.toHaveAttribute("inert");
});
it("closes by backdrop and navigation while hiding modules outside the role", () => {
  mockUser = { role: "buyer" };
  const close = jest.fn();
  render(<Sidebar isOpen onClose={close} />);
  expect(screen.queryByRole("link", { name: "users" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "buyerPortal" }));
  fireEvent.click(screen.getAllByRole("button", { name: "closeMenu" })[0]);
  expect(close).toHaveBeenCalledTimes(2);
});
it("renders no navigation without an authenticated user", () => {
  mockUser = null;
  const { container } = render(<Sidebar />);
  expect(container).toBeEmptyDOMElement();
});
