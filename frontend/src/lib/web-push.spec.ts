import { enableWebPush, disableWebPush } from "./web-push";
import { noticesApi } from "./api/agenda";
jest.mock("./api/agenda", () => ({
  noticesApi: {
    config: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));
jest.mock("./auth", () => ({ getToken: () => "original-session" }));
const requestPermission = jest.fn(),
  register = jest.fn(),
  getRegistration = jest.fn(),
  subscribe = jest.fn(),
  getSubscription = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class {},
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { requestPermission },
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, getRegistration, ready: Promise.resolve() },
  });
  jest
    .mocked(noticesApi.config)
    .mockResolvedValue({ enabled: true, publicKey: "BAAA" });
  requestPermission.mockResolvedValue("granted");
  getSubscription.mockResolvedValue(null);
  register.mockResolvedValue({ pushManager: { subscribe, getSubscription } });
});
describe("web push opt-in and logout", () => {
  it("keeps the inbox available when permission is denied", async () => {
    requestPermission.mockResolvedValue("denied");
    expect(await enableWebPush()).toBe(false);
    expect(register).not.toHaveBeenCalled();
    expect(noticesApi.subscribe).not.toHaveBeenCalled();
  });
  it("registers and persists a browser subscription only after explicit permission", async () => {
    const sub = { endpoint: "https://push.test", toJSON: () => ({}) };
    subscribe.mockResolvedValue(sub);
    expect(await enableWebPush()).toBe(true);
    expect(requestPermission).toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith("/rent-notifications-sw.js", {
      scope: "/",
    });
    expect(noticesApi.subscribe).toHaveBeenCalledWith(sub);
  });
  it("unsubscribes locally even if the backend removal fails, preserving the original session token", async () => {
    const unsub = jest.fn().mockResolvedValue(true);
    getRegistration.mockResolvedValue({
      pushManager: {
        getSubscription: async () => ({
          endpoint: "https://push.test",
          unsubscribe: unsub,
        }),
      },
    });
    jest.mocked(noticesApi.unsubscribe).mockRejectedValue(new Error("offline"));
    await expect(disableWebPush()).rejects.toThrow("offline");
    expect(noticesApi.unsubscribe).toHaveBeenCalledWith(
      "https://push.test",
      "original-session",
    );
    expect(unsub).toHaveBeenCalled();
  });
});
