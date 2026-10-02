import { act, renderHook } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
it("keeps the initial value and waits until typing stops", () => {
  const { result, rerender, unmount } = renderHook(
    ({ value }) => useDebouncedValue(value),
    { initialProps: { value: "a" } },
  );
  expect(result.current).toBe("a");
  rerender({ value: "b" });
  act(() => {
    jest.advanceTimersByTime(200);
  });
  rerender({ value: "c" });
  act(() => {
    jest.advanceTimersByTime(299);
  });
  expect(result.current).toBe("a");
  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(result.current).toBe("c");
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});
