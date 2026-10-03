import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import AiAssistantPanel from "./AiAssistantPanel";
import { aiApi } from "@/lib/api/ai";
import type { ComponentProps } from "react";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ usePathname: () => "/es/properties" }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ push: mockPush }),
}));

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/lib/api/ai", () => ({
  aiApi: { respond: jest.fn(), getConversation: jest.fn() },
}));
jest.mock("marked", () => ({
  marked: { parse: (text: string) => `<p>${text}</p>` },
}));

const storageKey = "ai-assistant-conversation-id:company:user";
const mockClose = jest.fn();
const props = {
  isOpen: true,
  mode: "FULL" as const,
  onClose: mockClose,
  conversationScope: "company:user",
};
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
async function openPanel(
  extra: Partial<ComponentProps<typeof AiAssistantPanel>> = {},
) {
  const result = render(<AiAssistantPanel {...props} {...extra} />);
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  return result;
}
async function send(prompt = "Review leases") {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: prompt } });
  fireEvent.click(screen.getByRole("button", { name: "send" }));
  await waitFor(() => expect(aiApi.respond).toHaveBeenCalled());
}
function history(contents: string[]) {
  return {
    conversationId: "saved",
    messages: contents.map((content, index) => ({
      id: String(index),
      role: index === 0 ? ("user" as const) : ("assistant" as const),
      content,
      model: index === 0 ? null : "model",
      createdAt: "2026-10-02",
    })),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  jest.mocked(aiApi.respond).mockResolvedValue({
    conversationId: "new",
    outputText: "Done",
    model: "model",
    mode: "FULL",
  });
  jest
    .mocked(aiApi.getConversation)
    .mockResolvedValue(history(["Old request", "Old reply"]));
});

it("stays closed without loading history and opens with accessible controls", async () => {
  localStorage.setItem(storageKey, "saved");
  const { rerender } = render(<AiAssistantPanel {...props} isOpen={false} />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(aiApi.getConversation).not.toHaveBeenCalled();
  rerender(<AiAssistantPanel {...props} />);
  await waitFor(() =>
    expect(screen.getByText("Old reply")).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("region", { name: "aiAssistant" }),
  ).toBeInTheDocument();
  expect(aiApi.getConversation).toHaveBeenCalledWith("saved");
  fireEvent.click(screen.getByRole("button", { name: "aiMaximize" }));
  expect(screen.getByRole("region")).toHaveClass("bottom-4");
  fireEvent.click(screen.getByRole("button", { name: "aiRestore" }));
  expect(screen.getByRole("region")).not.toHaveClass("bottom-4");
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  expect(mockClose).toHaveBeenCalledTimes(1);
});

it("ignores a legacy conversation or another user's stored history", async () => {
  localStorage.setItem("ai-assistant-conversation-id", "foreign");
  localStorage.setItem(
    "ai-assistant-conversation-id:company:another",
    "foreign",
  );
  await openPanel();
  expect(aiApi.getConversation).not.toHaveBeenCalled();
  expect(screen.getByText("aiAssistantPlaceholder")).toBeInTheDocument();
  expect(screen.getByText("aiModeFull")).toBeInTheDocument();
});

it("rejects empty prompts and submits trimmed input while persisting the scoped id", async () => {
  await openPanel();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "  " } });
  expect(screen.getByRole("button", { name: "send" })).toBeDisabled();
  fireEvent.submit(
    screen.getByRole("button", { name: "send" }).closest("form")!,
  );
  expect(aiApi.respond).not.toHaveBeenCalled();
  await send("  Review leases  ");
  await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
  expect(aiApi.respond).toHaveBeenCalledWith("Review leases", {
    conversationId: undefined,
    currentPath: "/es/properties",
  });
  expect(localStorage.getItem(storageKey)).toBe("new");
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.getByText("Review leases")).toBeInTheDocument();
  await send("Follow up");
  expect(aiApi.respond).toHaveBeenLastCalledWith("Follow up", {
    conversationId: "new",
    currentPath: "/es/properties",
  });
});

it("hydrates once and uses the server's conversation id", async () => {
  localStorage.setItem(storageKey, "saved");
  const { rerender } = await openPanel();
  await send();
  expect(aiApi.respond).toHaveBeenCalledWith("Review leases", {
    conversationId: "saved",
    currentPath: "/es/properties",
  });
  await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
  rerender(<AiAssistantPanel {...props} isOpen={false} />);
  rerender(<AiAssistantPanel {...props} />);
  expect(aiApi.getConversation).toHaveBeenCalledTimes(1);
});

it("blocks sending until history is resolved", async () => {
  const load = pending<ReturnType<typeof history>>();
  jest.mocked(aiApi.getConversation).mockReturnValue(load.promise);
  localStorage.setItem(storageKey, "saved");
  render(<AiAssistantPanel {...props} />);
  expect(screen.getByRole("textbox")).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Request" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "send" }).closest("form")!,
  );
  expect(aiApi.respond).not.toHaveBeenCalled();
  await act(async () => load.resolve(history(["Old request", "Old reply"])));
  expect(screen.getByRole("textbox")).toBeEnabled();
});

it("starts a fresh conversation after an inaccessible or deleted history", async () => {
  localStorage.setItem(storageKey, "saved");
  jest.mocked(aiApi.getConversation).mockRejectedValue(new Error("Forbidden"));
  await openPanel();
  expect(localStorage.getItem(storageKey)).toBeNull();
  expect(screen.queryByText("Old reply")).not.toBeInTheDocument();
  await send();
  expect(aiApi.respond).toHaveBeenCalledWith("Review leases", {
    conversationId: undefined,
    currentPath: "/es/properties",
  });
});

it("ignores history responses after closure, then reloads on reopening", async () => {
  localStorage.setItem(storageKey, "saved");
  const load = pending<ReturnType<typeof history>>();
  jest.mocked(aiApi.getConversation).mockReturnValueOnce(load.promise);
  const { rerender } = render(<AiAssistantPanel {...props} />);
  rerender(<AiAssistantPanel {...props} isOpen={false} />);
  await act(async () => load.resolve(history(["Stale user", "Stale answer"])));
  rerender(<AiAssistantPanel {...props} />);
  await waitFor(() =>
    expect(screen.getByText("Old reply")).toBeInTheDocument(),
  );
  expect(screen.queryByText("Stale answer")).not.toBeInTheDocument();
  expect(aiApi.getConversation).toHaveBeenCalledTimes(2);
});

it("preserves a saved history when a cancelled request fails", async () => {
  localStorage.setItem(storageKey, "saved");
  const load = pending<ReturnType<typeof history>>();
  jest.mocked(aiApi.getConversation).mockReturnValueOnce(load.promise);
  const { unmount } = render(<AiAssistantPanel {...props} />);
  unmount();
  await act(async () => load.reject(new Error("Network")));
  expect(localStorage.getItem(storageKey)).toBe("saved");
});

it("prevents duplicate submissions while the request is pending", async () => {
  const response = pending<Awaited<ReturnType<typeof aiApi.respond>>>();
  jest.mocked(aiApi.respond).mockReturnValue(response.promise);
  await openPanel();
  await send();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Duplicate" },
  });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  fireEvent.submit(
    screen.getByRole("button", { name: "send" }).closest("form")!,
  );
  expect(aiApi.respond).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "send" })).toBeDisabled();
  await act(async () =>
    response.resolve({
      conversationId: "new",
      outputText: "Done",
      model: "model",
      mode: "FULL",
    }),
  );
  expect(screen.getByRole("button", { name: "send" })).toBeEnabled();
});

it("supports Enter submission, Shift+Enter newline and normal typing", async () => {
  await openPanel();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Keyboard request" },
  });
  fireEvent.keyDown(screen.getByRole("textbox"), {
    key: "Enter",
    shiftKey: true,
  });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "a" });
  expect(aiApi.respond).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("textbox"), {
    key: "Enter",
    shiftKey: false,
  });
  await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
  expect(aiApi.respond).toHaveBeenCalledWith("Keyboard request", {
    conversationId: undefined,
    currentPath: "/es/properties",
  });
});

it.each([new Error("Provider unavailable"), "unexpected"])(
  "shows failed requests and permits explicit retry: %p",
  async (error) => {
    jest.mocked(aiApi.respond).mockRejectedValueOnce(error);
    await openPanel();
    await send();
    await waitFor(() =>
      expect(
        screen.getByText(error instanceof Error ? error.message : "error"),
      ).toBeInTheDocument(),
    );
    await send("Retry");
    await waitFor(() => expect(screen.getByText("Done")).toBeInTheDocument());
    expect(aiApi.respond).toHaveBeenCalledTimes(2);
  },
);

it("shows read-only mode and disables a revoked AI mode", async () => {
  const { rerender } = await openPanel({ mode: "READONLY" });
  expect(screen.getByText("aiModeReadonly")).toBeInTheDocument();
  rerender(<AiAssistantPanel {...props} mode="NONE" />);
  expect(screen.getByRole("textbox")).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Revoked" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "send" }).closest("form")!,
  );
  expect(aiApi.respond).not.toHaveBeenCalled();
});

it("sanitizes assistant HTML without interpreting user content", async () => {
  jest.mocked(aiApi.respond).mockResolvedValue({
    conversationId: "new",
    model: "model",
    mode: "FULL",
    outputText:
      '<script>window.secret=true</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a><strong>Safe</strong>',
  });
  const { container } = await openPanel();
  await send('<img src=x onerror="alert(1)">');
  await waitFor(() => expect(screen.getByText("Safe")).toBeInTheDocument());
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).not.toHaveAttribute("onerror");
  expect(screen.getByText("unsafe")).not.toHaveAttribute("href");
  expect(
    screen.getByText('<img src=x onerror="alert(1)">'),
  ).toBeInTheDocument();
});

it("renders nested JSON tables and expands objects and arrays accessibly", async () => {
  const payload = {
    amount: 42,
    paid: true,
    note: "ok",
    optional: null,
    items: [1, { currency: "ARS" }],
  };
  jest.mocked(aiApi.respond).mockResolvedValue({
    conversationId: "new",
    model: "model",
    mode: "FULL",
    outputText: "```json\n" + JSON.stringify(payload) + "\n```",
  });
  await openPanel();
  await send();
  const table = await screen.findByRole("table");
  expect(
    within(table).getByRole("columnheader", { name: "aiJsonField" }),
  ).toBeInTheDocument();
  expect(within(table).getByText("42")).toBeInTheDocument();
  expect(within(table).getByText("true")).toBeInTheDocument();
  expect(within(table).getAllByText("null")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "aiJsonExpand" }));
  const collapse = screen.getByRole("button", { name: "aiJsonCollapse" });
  expect(collapse).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "aiJsonExpand" }));
  expect(screen.getByText("ARS")).toBeInTheDocument();
  fireEvent.click(collapse);
  expect(screen.queryByText("ARS")).not.toBeInTheDocument();
});

it.each(["null", "123", '"text"', "false", "[]", "{}"])(
  "renders valid scalar or empty JSON: %s",
  async (outputText) => {
    jest.mocked(aiApi.respond).mockResolvedValue({
      conversationId: "",
      model: "model",
      mode: "FULL",
      outputText,
    });
    await openPanel();
    await send();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(localStorage.getItem(storageKey)).toBeNull();
  },
);

it("handles an empty response without inventing a JSON table", async () => {
  jest.mocked(aiApi.respond).mockResolvedValue({
    conversationId: "",
    model: "model",
    mode: "FULL",
    outputText: "",
  });
  await openPanel();
  await send();
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("navigates to a validated application action and requests its guidance", async () => {
  jest.mocked(aiApi.respond).mockResolvedValue({
    conversationId: "new",
    model: "application",
    mode: "READONLY",
    outputText: "Cambiar contraseña",
    uiAction: { type: "navigate", path: "/settings", guide: "password" },
  });
  await openPanel();
  await send("quiero cambiar password");
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/settings"));
  expect(mockClose).toHaveBeenCalled();
  expect(sessionStorage.getItem("rent:assistant-guidance")).toContain(
    "password",
  );
  expect(localStorage.getItem(storageKey)).toBe("new");
});

it("keeps data answers in the chat and rejects arbitrary navigation targets", async () => {
  jest.mocked(aiApi.respond).mockResolvedValue({
    conversationId: "new",
    model: "application",
    mode: "READONLY",
    outputText: "ARS 100",
    uiAction: {
      type: "navigate",
      path: "javascript:alert(1)",
      guide: "screen",
    },
  });
  await openPanel();
  await send("cobranza de hoy");
  await waitFor(() => expect(screen.getByText("ARS 100")).toBeInTheDocument());
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockClose).not.toHaveBeenCalled();
});
