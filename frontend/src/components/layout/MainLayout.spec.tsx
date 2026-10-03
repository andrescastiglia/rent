import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import MainLayout from "./MainLayout";
import { aiApi } from "@/lib/api/ai";
const mockRouter = { replace: jest.fn() };
let mockAuth: {
  user: { id: string; companyId?: string } | null;
  token: string | null;
  loading: boolean;
};
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => mockRouter,
}));
jest.mock("@/lib/api/ai", () => ({ aiApi: { getToolsStatus: jest.fn() } }));
jest.mock("@/components/layout/Header", () => ({
  __esModule: true,
  default: ({
    onMenuToggle,
    onAiToggle,
    sidebarOpen,
    aiEnabled,
  }: {
    onMenuToggle: () => void;
    onAiToggle: () => void;
    sidebarOpen: boolean;
    aiEnabled: boolean;
  }) => (
    <header>
      <button onClick={onMenuToggle}>toggle menu</button>
      <button disabled={!aiEnabled} onClick={onAiToggle}>
        toggle AI
      </button>
      <span>menu:{String(sidebarOpen)}</span>
    </header>
  ),
}));
jest.mock("@/components/layout/Sidebar", () => ({
  __esModule: true,
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <button onClick={onClose}>close menu</button> : null,
}));
jest.mock("@/components/layout/Footer", () => ({
  __esModule: true,
  default: () => <footer>Footer</footer>,
}));
jest.mock("@/components/ui/Breadcrumbs", () => ({
  __esModule: true,
  default: () => <nav>Breadcrumbs</nav>,
}));
jest.mock("@/components/common/ContextualGuidance", () => ({
  __esModule: true,
  default: () => <aside>Permanent guidance</aside>,
}));
jest.mock("@/components/ai/AiAssistantPanel", () => ({
  __esModule: true,
  default: ({
    isOpen,
    onClose,
    conversationScope,
  }: {
    isOpen: boolean;
    onClose: () => void;
    conversationScope: string;
  }) =>
    isOpen ? (
      <section aria-label="AI">
        <input aria-label="Conversation draft" defaultValue="" />
        <span>{conversationScope}</span>
        <button onClick={onClose}>close AI</button>
      </section>
    ) : null,
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { user: { id: "user" }, token: "token", loading: false };
  jest.mocked(aiApi.getToolsStatus).mockResolvedValue({ mode: "ALL" } as never);
});
it("keeps guidance in the application layout and supports menu and AI open and close", async () => {
  render(
    <MainLayout>
      <h1>Content</h1>
    </MainLayout>,
  );
  expect(screen.getByRole("main")).toContainElement(
    screen.getByRole("heading", { name: "Content" }),
  );
  expect(screen.getByText("Permanent guidance")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "skipToContent" })).toHaveAttribute(
    "href",
    "#main-content",
  );
  fireEvent.click(screen.getByRole("button", { name: "toggle menu" }));
  expect(screen.getByText("menu:true")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "close menu" }));
  expect(screen.getByText("menu:false")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "toggle AI" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "toggle AI" }));
  expect(screen.getByRole("region", { name: "AI" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "close AI" }));
  expect(screen.queryByRole("region", { name: "AI" })).not.toBeInTheDocument();
  expect(aiApi.getToolsStatus).toHaveBeenCalledTimes(1);
});
it("shows auth loading before the application and redirects unauthenticated users", () => {
  mockAuth = { user: null, token: null, loading: true };
  const { rerender } = render(<MainLayout>Content</MainLayout>);
  expect(screen.getByRole("status")).toHaveTextContent("loading");
  expect(mockRouter.replace).not.toHaveBeenCalled();
  mockAuth.loading = false;
  rerender(<MainLayout>Content</MainLayout>);
  expect(mockRouter.replace).toHaveBeenCalledWith("/login");
  expect(aiApi.getToolsStatus).not.toHaveBeenCalled();
});
it("keeps financial pages available when the optional AI capability lookup fails", async () => {
  jest.mocked(aiApi.getToolsStatus).mockRejectedValueOnce(new Error("offline"));
  render(
    <MainLayout>
      <h1>Content</h1>
    </MainLayout>,
  );
  await waitFor(() => expect(aiApi.getToolsStatus).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "toggle AI" })).toBeDisabled();
  expect(screen.getByText("Content")).toBeInTheDocument();
});

it("hides AI until the new actor is authorized and remounts their conversation", async () => {
  const content = <input aria-label="Content draft" defaultValue="" />;
  const { rerender } = render(<MainLayout>{content}</MainLayout>);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "toggle AI" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "toggle AI" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Conversation draft" }),
    { target: { value: "Private request" } },
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Content draft" }), {
    target: { value: "Private page data" },
  });
  let resolve!: (
    value: Awaited<ReturnType<typeof aiApi.getToolsStatus>>,
  ) => void;
  jest.mocked(aiApi.getToolsStatus).mockReturnValueOnce(
    new Promise((res) => {
      resolve = res;
    }),
  );
  mockAuth = {
    user: { id: "another", companyId: "company" },
    token: "new-token",
    loading: false,
  };
  rerender(<MainLayout>{content}</MainLayout>);
  expect(screen.getByRole("button", { name: "toggle AI" })).toBeDisabled();
  expect(
    screen.queryByRole("textbox", { name: "Conversation draft" }),
  ).not.toBeInTheDocument();
  await act(async () => resolve({ mode: "FULL", tools: [] }));
  expect(screen.getByText("company:another")).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: "Conversation draft" }),
  ).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Content draft" })).toHaveValue(
    "",
  );
});

it("ignores a capability lookup resolving after logout", async () => {
  let resolve!: (
    value: Awaited<ReturnType<typeof aiApi.getToolsStatus>>,
  ) => void;
  jest.mocked(aiApi.getToolsStatus).mockReturnValueOnce(
    new Promise((res) => {
      resolve = res;
    }),
  );
  const { rerender } = render(<MainLayout>Content</MainLayout>);
  mockAuth = { user: null, token: null, loading: false };
  rerender(<MainLayout>Content</MainLayout>);
  await act(async () => resolve({ mode: "FULL", tools: [] }));
  expect(screen.queryByRole("main")).not.toBeInTheDocument();
  expect(mockRouter.replace).toHaveBeenCalledWith("/login");
});
it.each([
  "/es/notifications/00000000-0000-4000-8000-000000000001",
  "/es/agenda/people/interested/person?entry=task%3Aid",
])("preserves an agenda destination before authentication: %s", (path) => {
  window.history.replaceState({}, "", path);
  sessionStorage.clear();
  mockAuth = { user: null, token: null, loading: false };
  render(<MainLayout>Content</MainLayout>);
  expect(sessionStorage.getItem("rent.returnTo")).toBe(path);
  expect(mockRouter.replace).toHaveBeenCalledWith("/login");
  window.history.replaceState({}, "", "/");
  sessionStorage.clear();
});
