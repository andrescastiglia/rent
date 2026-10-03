/** @jest-environment node */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const path = "/es/notifications/00000000-0000-4000-8000-000000000001";
function worker(tabs: unknown[] = []) {
  const handlers: Record<string, (event: any) => void> = {};
  const clients = {
    matchAll: jest.fn().mockResolvedValue(tabs),
    openWindow: jest.fn().mockResolvedValue(null),
  };
  const registration = {
    showNotification: jest.fn().mockResolvedValue(undefined),
  };
  runInNewContext(
    readFileSync(
      resolve(process.cwd(), "public/rent-notifications-sw.js"),
      "utf8",
    ),
    {
      URL,
      self: {
        location: { origin: "https://rent.test" },
        clients,
        registration,
        addEventListener: (name: string, handler: (event: any) => void) => {
          handlers[name] = handler;
        },
      },
    },
  );
  return {
    ...clients,
    ...registration,
    async dispatch(name: string, event: object) {
      let pending: Promise<unknown> = Promise.resolve();
      handlers[name]({
        ...event,
        waitUntil: (p: Promise<unknown>) => {
          pending = p;
        },
      });
      await pending;
    },
  };
}
describe("notification service worker navigation", () => {
  it("opens the validated destination when no tab is open", async () => {
    const w = worker();
    const close = jest.fn();
    await w.dispatch("notificationclick", {
      notification: { data: { path }, close },
    });
    expect(close).toHaveBeenCalled();
    expect(w.openWindow).toHaveBeenCalledWith("https://rent.test" + path);
  });
  it("navigates and focuses an existing Rent window", async () => {
    const tab = {
      url: "https://rent.test/es/dashboard",
      navigate: jest.fn().mockResolvedValue(null),
      focus: jest.fn().mockResolvedValue(null),
    };
    const w = worker([tab]);
    await w.dispatch("notificationclick", {
      notification: { data: { path }, close: jest.fn() },
    });
    expect(tab.navigate).toHaveBeenCalledWith("https://rent.test" + path);
    expect(tab.focus).toHaveBeenCalled();
    expect(w.openWindow).not.toHaveBeenCalled();
  });
  it.each([
    "https://foreign.test",
    "//foreign.test/es/notifications/id",
    "/es/agenda/delete",
    "/es/notifications/../../private",
  ])("rejects an untrusted path: %s", async (invalid) => {
    const w = worker();
    await w.dispatch("notificationclick", {
      notification: { data: { path: invalid }, close: jest.fn() },
    });
    expect(w.openWindow).not.toHaveBeenCalled();
  });
  it("shows a persistent native notice and refreshes open inboxes", async () => {
    const tab = { postMessage: jest.fn() };
    const w = worker([tab]);
    await w.dispatch("push", {
      data: { json: () => ({ path, title: "Recordatorio", tag: "notice-id" }) },
    });
    expect(w.showNotification).toHaveBeenCalledWith(
      "Rent · Recordatorio",
      expect.objectContaining({ data: { path }, tag: "notice-id" }),
    );
    expect(tab.postMessage).toHaveBeenCalledWith({ type: "rent-notification" });
  });
});
