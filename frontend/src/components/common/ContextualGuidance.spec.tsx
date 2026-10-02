import { act, fireEvent, render, screen } from "@testing-library/react";
import ContextualGuidance from "./ContextualGuidance";

let pathname = "/es/properties";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field: string }) =>
    values?.field ? `${key}:${values.field}` : key,
}));

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
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
