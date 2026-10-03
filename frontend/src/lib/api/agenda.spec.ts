import { agendaApi, noticesApi } from "./agenda";
import { apiClient } from "@/lib/api";
import { getToken } from "@/lib/auth";
jest.mock("@/lib/api", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("@/lib/auth", () => ({ getToken: jest.fn(() => "token") }));
beforeEach(() => jest.clearAllMocks());
it("encodes agenda filters and identifiers and authenticates all reads", async () => {
  await agendaApi.config();
  await agendaApi.list();
  await agendaApi.list({ search: "Ana & Juan", page: 2 });
  await agendaApi.entry("task:a/b");
  await agendaApi.people("Ana & Juan");
  await agendaApi.people();
  await agendaApi.person("owner", "a/b");
  await agendaApi.staff();
  await agendaApi.history("task:a/b");
  expect(apiClient.get).toHaveBeenCalledWith(
    "/agenda?search=Ana+%26+Juan&page=2",
    "token",
  );
  expect(apiClient.get).toHaveBeenCalledWith(
    "/agenda/entries/task%3Aa%2Fb",
    "token",
  );
  expect(apiClient.get).toHaveBeenCalledWith(
    "/agenda/people/owner/a%2Fb",
    "token",
  );
});
it("passes stable command keys and versions to writes", async () => {
  await agendaApi.create({ title: "Call" }, "key");
  await agendaApi.update("task:one", { version: 1, title: "New" }, "key");
  const settings = {
    version: "1:UTC",
    responsibleUserId: null,
    reminderMinutes: 15,
    reminderHour: 9,
  };
  await agendaApi.settings("visit:one", settings, "key");
  expect(apiClient.post).toHaveBeenCalledWith(
    "/agenda/tasks",
    { title: "Call" },
    "token",
    { "Idempotency-Key": "key" },
  );
  expect(apiClient.patch).toHaveBeenCalledWith(
    "/agenda/entries/visit%3Aone/settings",
    settings,
    "token",
    { "Idempotency-Key": "key" },
  );
});
it("covers authenticated notice operations and explicit logout credentials", async () => {
  await noticesApi.list();
  await noticesApi.list(2);
  await noticesApi.read("notice");
  await noticesApi.destination("notice");
  await noticesApi.config();
  await noticesApi.subscribe({
    toJSON: () => ({ endpoint: "push" }),
  } as PushSubscription);
  await noticesApi.unsubscribe("push");
  await noticesApi.unsubscribe("push", "logout-token");
  await noticesApi.preferences();
  await noticesApi.setPreferences([{ event: "assigned", enabled: false }]);
  expect(apiClient.post).toHaveBeenCalledWith(
    "/notifications/web/subscriptions/remove",
    { endpoint: "push" },
    "logout-token",
  );
  (getToken as jest.Mock).mockReturnValue(null);
  await agendaApi.config();
  expect(apiClient.get).toHaveBeenLastCalledWith("/agenda/config", undefined);
});
