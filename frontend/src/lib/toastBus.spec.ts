import { emitToast, subscribeToToasts } from "./toastBus";
it("deduplicates repeated errors, permits different results, and removes subscriptions", () => {
  const now = jest.spyOn(Date, "now");
  now.mockReturnValue(10000);
  const listener = jest.fn();
  const off = subscribeToToasts(listener);
  const error = {
    kind: "error" as const,
    namespace: "payments",
    key: "failed",
  };
  emitToast(error);
  emitToast(error);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(error);
  emitToast({ ...error, kind: "success" });
  expect(listener).toHaveBeenCalledTimes(2);
  now.mockReturnValue(18000);
  emitToast(error);
  expect(listener).toHaveBeenCalledTimes(3);
  off();
  now.mockReturnValue(26000);
  emitToast(error);
  expect(listener).toHaveBeenCalledTimes(3);
  now.mockRestore();
});
it("is safe on server runtimes without EventTarget", async () => {
  const original = globalThis.EventTarget;
  Object.defineProperty(globalThis, "EventTarget", {
    configurable: true,
    value: undefined,
  });
  try {
    await jest.isolateModulesAsync(async () => {
      const bus = await import("./toastBus");
      const listener = jest.fn();
      const off = bus.subscribeToToasts(listener);
      bus.emitToast({ kind: "info", namespace: "test", key: "ready" });
      off();
      expect(listener).not.toHaveBeenCalled();
    });
  } finally {
    Object.defineProperty(globalThis, "EventTarget", {
      configurable: true,
      value: original,
    });
  }
});
