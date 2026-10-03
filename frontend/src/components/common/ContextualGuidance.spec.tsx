import { act, fireEvent, render, screen } from "@testing-library/react";
import ContextualGuidance from "./ContextualGuidance";
import { requestAssistantGuidance } from "@/lib/assistant-guidance";

let pathname = "/es/properties";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field: string }) =>
    values?.field ? `${key}:${values.field}` : key,
}));

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  pathname = "/es/properties";
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 160,
    height: 44,
    top: 50,
    bottom: 94,
    left: 20,
    right: 180,
    x: 20,
    y: 50,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function Workspace() {
  return (
    <>
      <main id="main-content">
        <input id="properties-search" aria-label="Buscar propiedad" />
        <form>
          <label htmlFor="address">Dirección</label>
          <input id="address" required defaultValue="San Martín 10" />
          <button type="submit">Guardar</button>
        </form>
      </main>
      <ContextualGuidance />
    </>
  );
}
const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

it.each([
  ["/properties/10000000-0000-4000-8000-000000000001/edit", "rentPrice"],
  ["/leases/10000000-0000-4000-8000-000000000001/edit", "rentAmount"],
  ["/settings", "phone"],
  ["/templates/editor", "template-editor-name"],
])(
  "guides an existing field in %s without filling or saving",
  (path, field) => {
    pathname = "/es" + path;
    const save = jest.fn();
    render(
      <>
        <main id="main-content">
          <form onSubmit={save}>
            <input id={field} aria-label="Dato" defaultValue="Dato original" />
            <button type="submit">Guardar</button>
          </form>
        </main>
        <ContextualGuidance />
      </>,
    );
    act(() =>
      requestAssistantGuidance({
        type: "navigate",
        guide: "screen",
        path,
        intent: "edit",
        field,
        instruction: "Modificá este dato; revisá y guardá desde el formulario.",
      }),
    );
    expect(screen.getByLabelText("Dato")).toHaveAttribute(
      "data-guidance-target",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Modificá este dato");
    expect(screen.getByLabelText("Dato")).toHaveValue("Dato original");
    fireEvent.click(screen.getByText("goToControl"));
    expect(screen.getByLabelText("Dato")).toHaveFocus();
    expect(save).not.toHaveBeenCalled();
  },
);

it("opens only the registered editor for the requested record, leaving Save untouched", async () => {
  pathname = "/es/users";
  const id = "10000000-0000-4000-8000-000000000001";
  const save = jest.fn();
  const open = jest.fn(() => {
    const form = document.createElement("form");
    form.innerHTML =
      '<input data-guide="phone" value="Original"/><button type="submit">Guardar</button>';
    form.addEventListener("submit", save);
    document.getElementById("main-content")!.append(form);
  });
  render(
    <>
      <main id="main-content">
        <button
          type="button"
          data-assistant-intent="edit"
          data-assistant-record={id}
          onClick={open}
        >
          Editar
        </button>
        <button type="submit" onClick={save}>
          Guardar
        </button>
      </main>
      <ContextualGuidance />
    </>,
  );
  act(() =>
    requestAssistantGuidance({
      type: "navigate",
      guide: "screen",
      path: "/users",
      intent: "edit",
      recordId: id,
      field: "phone",
      instruction: "Modificá el teléfono.",
    }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(open).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent("Modificá el teléfono");
  expect(save).not.toHaveBeenCalled();
});

it("waits eight seconds, announces politely and preserves focus", () => {
  render(<Workspace />);
  const search = screen.getByLabelText("Buscar propiedad");
  search.focus();
  advance(7999);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  advance(1);
  expect(screen.getByRole("status")).toHaveTextContent("propertiesEntry");
  expect(document.activeElement).toBe(search);
  expect(search).toHaveAttribute("data-guidance-target");
});

it("resets idle time on scrolling and uses twelve seconds after writing", () => {
  render(<Workspace />);
  advance(7000);
  fireEvent.scroll(document);
  advance(2000);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.input(screen.getByLabelText("Dirección"), {
    target: { value: "San Martín 100" },
  });
  advance(11999);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  advance(1);
  expect(screen.getByRole("status")).toHaveTextContent("propertyReview");
  expect(screen.getByLabelText("Dirección")).toHaveValue("San Martín 100");
});

it("dismisses with Escape and avoids repeating the same suggestion during the task", () => {
  render(<Workspace />);
  advance(8000);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  advance(8000);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("remembers pause, offers resume and reevaluates on another visit", () => {
  const { unmount } = render(<Workspace />);
  advance(8000);
  fireEvent.click(screen.getByText("pause"));
  expect(localStorage.getItem("rent:guidance:paused")).toBe("true");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  unmount();
  render(<Workspace />);
  advance(8000);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("resume"));
  advance(8000);
  expect(screen.getByRole("status")).toHaveTextContent("propertiesEntry");
});

it("only moves focus when requested and never clicks the operation", () => {
  render(<Workspace />);
  advance(8000);
  fireEvent.click(screen.getByText("goToControl"));
  expect(document.activeElement).toBe(
    screen.getByLabelText("Buscar propiedad"),
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("cleans up a scheduled suggestion on navigation and unmount", () => {
  const { rerender, unmount } = render(<Workspace />);
  advance(4000);
  pathname = "/es/privacy";
  rerender(<Workspace />);
  advance(8000);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it("dismisses with Escape while focus is inside the guidance controls", () => {
  render(<Workspace />);
  advance(8000);
  const button = screen.getByRole("button", { name: "goToControl" });
  button.focus();
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(button).not.toHaveAttribute("data-guidance-target");
});

it("hides guidance in a background tab and reevaluates after returning", () => {
  let hidden = false;
  jest.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  render(<Workspace />);
  advance(8000);
  hidden = true;
  fireEvent(document, new Event("visibilitychange"));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  advance(20000);
  hidden = false;
  fireEvent(document, new Event("visibilitychange"));
  advance(8000);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("waits for the destination form and immediately guides password steps despite paused idle help", async () => {
  localStorage.setItem("rent:guidance:paused", "true");
  requestAssistantGuidance({
    type: "navigate",
    path: "/settings",
    guide: "password",
  });
  pathname = "/es/settings";
  const { rerender } = render(
    <>
      <main id="main-content">
        <span>Cargando</span>
      </main>
      <ContextualGuidance />
    </>,
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  rerender(
    <>
      <main id="main-content">
        <p role="alert">Otro panel no pudo cargar su configuración.</p>
        <form>
          <input
            type="password"
            data-guide="password-current"
            aria-label="Actual"
          />
          <input type="password" data-guide="password-new" aria-label="Nueva" />
          <input
            type="password"
            data-guide="password-confirm"
            aria-label="Confirmar"
          />
          <button data-guide="password-submit">Cambiar</button>
        </form>
      </main>
      <ContextualGuidance />
    </>,
  );
  await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent("passwordCurrent");
  expect(screen.getByLabelText("Actual")).toHaveAttribute(
    "data-guidance-target",
  );
  expect(document.activeElement).not.toBe(screen.getByLabelText("Actual"));
  fireEvent.click(screen.getByRole("button", { name: "goToControl" }));
  expect(document.activeElement).toBe(screen.getByLabelText("Actual"));
  fireEvent.input(screen.getByLabelText("Actual"), {
    target: { value: "local-only" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("passwordNew");
  fireEvent.input(screen.getByLabelText("Nueva"), {
    target: { value: "short" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("passwordNew");
  fireEvent.input(screen.getByLabelText("Nueva"), {
    target: { value: "new-local-only" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("passwordConfirm");
  fireEvent.input(screen.getByLabelText("Confirmar"), {
    target: { value: "mismatch" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("passwordConfirm");
  fireEvent.input(screen.getByLabelText("Confirmar"), {
    target: { value: "new-local-only" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("passwordSave");
  expect(document.activeElement).toBe(screen.getByLabelText("Actual"));
  expect(localStorage.getItem("rent:guidance:paused")).toBe("true");
  expect(sessionStorage.getItem("rent:assistant-guidance")).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
