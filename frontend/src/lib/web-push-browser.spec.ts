import { enableWebPush, disableWebPush } from "./web-push";
import { noticesApi } from "./api/agenda";
jest.mock("./api/agenda", () => ({
  noticesApi: {
    config: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));
jest.mock("./auth", () => ({ getToken: () => "token" }));
const sub = { endpoint: "https://push.test", unsubscribe: jest.fn() };
const manager = { getSubscription: jest.fn(), subscribe: jest.fn() };
const sw = {
  register: jest.fn(),
  getRegistration: jest.fn(),
  ready: Promise.resolve(),
};
beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: sw,
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class {},
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { requestPermission: jest.fn(async () => "granted") },
  });
  (noticesApi.config as jest.Mock).mockResolvedValue({
    enabled: true,
    publicKey: "YWJj",
  });
  manager.getSubscription.mockResolvedValue(sub);
  manager.subscribe.mockResolvedValue(sub);
  sw.register.mockResolvedValue({ pushManager: manager });
  sw.getRegistration.mockResolvedValue({ pushManager: manager });
});
it("requires browser capabilities and configured VAPID", async () => {
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  await expect(enableWebPush()).rejects.toThrow("no admite");
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: sw,
  });
  (noticesApi.config as jest.Mock).mockResolvedValue({ enabled: false });
  await expect(enableWebPush()).rejects.toThrow("no están configuradas");
});
it("respects permission denial and registers granted subscriptions", async () => {
  (Notification.requestPermission as jest.Mock).mockResolvedValueOnce("denied");
  expect(await enableWebPush()).toBe(false);
  expect(sw.register).not.toHaveBeenCalled();
  expect(await enableWebPush()).toBe(true);
  expect(noticesApi.subscribe).toHaveBeenCalledWith(sub);
  manager.getSubscription.mockResolvedValue(null);
  await enableWebPush();
  expect(manager.subscribe).toHaveBeenCalledWith(
    expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    }),
  );
});
it("unsubscribes locally even if server removal fails", async () => {
  (noticesApi.unsubscribe as jest.Mock).mockRejectedValueOnce(
    new Error("offline"),
  );
  await expect(disableWebPush()).rejects.toThrow("offline");
  expect(sub.unsubscribe).toHaveBeenCalled();
  manager.getSubscription.mockResolvedValue(null);
  await disableWebPush();
  sw.getRegistration.mockResolvedValue(null);
  await disableWebPush();
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
  await disableWebPush();
});
