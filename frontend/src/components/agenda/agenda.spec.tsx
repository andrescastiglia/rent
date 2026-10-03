import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import AgendaBoard from "./AgendaBoard";
import AgendaDetail from "./AgendaDetail";
import TaskForm from "./TaskForm";
import EntrySettings from "./EntrySettings";
import NotificationBell from "./NotificationBell";
import { agendaApi, noticesApi, type AgendaEntry } from "@/lib/api/agenda";
import { enableWebPush, disableWebPush } from "@/lib/web-push";
const mockPush = jest.fn();
let mockUser = {
  id: "user",
  companyId: "company",
  role: "admin",
  roles: [] as string[],
};
const mockTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ push: mockPush }),
}));
jest.mock("@/components/contact-data/GeoCard", () => ({
  GeoCard: () => <div>Map</div>,
}));
jest.mock("@/components/contact-data/LocationPicker", () => ({
  LocationPicker: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onChange({ type: "property", id: "place" })}
    >
      location
    </button>
  ),
}));
jest.mock("@/lib/web-push", () => ({
  enableWebPush: jest.fn(),
  disableWebPush: jest.fn(),
}));
jest.mock("@/lib/api/agenda", () => ({
  agendaApi: Object.fromEntries(
    [
      "config",
      "people",
      "staff",
      "list",
      "entry",
      "person",
      "history",
      "create",
      "update",
      "settings",
    ].map((k) => [k, jest.fn()]),
  ),
  noticesApi: Object.fromEntries(
    ["list", "preferences", "setPreferences", "read"].map((k) => [
      k,
      jest.fn(),
    ]),
  ),
}));
const entry = (extra = {}) =>
  ({
    id: "task:one",
    title: "Call Ana",
    description: "Details",
    kind: "call",
    status: "pending",
    version: "1:0:UTC:15:9",
    timezone: "UTC",
    scheduledDate: "2026-10-03",
    scheduledAt: null,
    endsAt: null,
    reminderMinutes: 15,
    reminderHour: 9,
    responsibleUserId: null,
    responsibleName: "",
    personType: null,
    personId: null,
    editable: true,
    canEdit: true,
    ...extra,
  }) as AgendaEntry;
const person = {
  personType: "owner",
  personId: "ana",
  name: "Ana",
  phone: "+54911",
  email: "ana@test.com",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: "user", companyId: "company", role: "admin", roles: [] };
  (agendaApi.config as jest.Mock).mockResolvedValue({
    timezone: "UTC",
    reminderMinutes: 20,
    reminderHour: 8,
  });
  (agendaApi.people as jest.Mock).mockResolvedValue([person]);
  (agendaApi.staff as jest.Mock).mockResolvedValue([
    { id: "staff", name: "Staff" },
  ]);
  (agendaApi.list as jest.Mock).mockResolvedValue({
    data: [entry()],
    total: 101,
    page: 1,
    limit: 50,
  });
  (agendaApi.entry as jest.Mock).mockResolvedValue(entry());
  (agendaApi.person as jest.Mock).mockResolvedValue(person);
  (agendaApi.history as jest.Mock).mockResolvedValue([
    { event: "created", version: 1, createdAt: "2026-10-03" },
  ]);
  (agendaApi.create as jest.Mock).mockResolvedValue({ id: "task:new" });
  (agendaApi.update as jest.Mock).mockResolvedValue({});
  (agendaApi.settings as jest.Mock).mockResolvedValue({});
  (noticesApi.list as jest.Mock).mockResolvedValue({
    data: [{ id: "notice", title: "Notice", event: "assigned", readAt: null }],
    unread: 1,
    total: 101,
  });
  (noticesApi.preferences as jest.Mock).mockResolvedValue([
    { event: "assigned", enabled: true },
  ]);
  (noticesApi.setPreferences as jest.Mock).mockResolvedValue({});
  (noticesApi.read as jest.Mock).mockResolvedValue({});
  (enableWebPush as jest.Mock).mockResolvedValue(true);
  (disableWebPush as jest.Mock).mockResolvedValue(undefined);
});
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
it("creates a person followup and reuses its key after a lost response", async () => {
  const saved = jest.fn();
  (agendaApi.create as jest.Mock).mockRejectedValueOnce(
    new Error("lost response"),
  );
  render(
    <TaskForm person={person} relatedEntryId="task:old" onSaved={saved} />,
  );
  await waitFor(() => expect(screen.getByText("save")).toBeEnabled());
  change("title", "Visit Ana");
  change("description", "Bring keys");
  change("kind", "visit");
  fireEvent.click(screen.getByText("location"));
  change("responsible", "staff");
  change("schedule", "date");
  change("date", "2026-10-05");
  change("reminderHour", "10");
  change("findPerson", "Ana");
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText("lost response");
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() => expect(saved).toHaveBeenCalledWith("task:new"));
  expect((agendaApi.create as jest.Mock).mock.calls[0][1]).toBe(
    (agendaApi.create as jest.Mock).mock.calls[1][1],
  );
  expect(agendaApi.create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      personType: "owner",
      personId: "ana",
      locationId: "place",
      relatedEntryId: "task:old",
      responsibleUserId: "staff",
      reminderHour: 10,
    }),
    expect.any(String),
  );
});
it("requires civil dates and converts timed schedules in the company timezone", async () => {
  render(<TaskForm onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("save")).toBeEnabled());
  change("title", "Call");
  change("schedule", "date");
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText("requiredDate");
  expect(agendaApi.create).not.toHaveBeenCalled();
  change("schedule", "time");
  change("dateTime (UTC)", "2026-10-03T15:00");
  change("end", "2026-10-03T16:00");
  change("reminderMinutes", "30");
  change("person", "owner:ana");
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() =>
    expect(agendaApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledAt: "2026-10-03T15:00:00.000Z",
        endsAt: "2026-10-03T16:00:00.000Z",
        reminderMinutes: 30,
      }),
      expect.any(String),
    ),
  );
});
it("edits tasks without changing the linked person", async () => {
  render(
    <TaskForm
      entry={entry({
        scheduledDate: null,
        scheduledAt: "2026-10-03T15:00:00Z",
        endsAt: "2026-10-03T16:00:00Z",
        responsibleUserId: "staff",
      })}
      onSaved={jest.fn()}
    />,
  );
  await waitFor(() => expect(screen.getByText("save")).toBeEnabled());
  change("title", "Updated");
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() => expect(agendaApi.update).toHaveBeenCalled());
  expect((agendaApi.update as jest.Mock).mock.calls[0][1]).toMatchObject({
    title: "Updated",
    version: 1,
  });
  expect((agendaApi.update as jest.Mock).mock.calls[0][1]).not.toHaveProperty(
    "personId",
  );
});
it("shows setup errors and prevents submission until configuration loads", async () => {
  (agendaApi.config as jest.Mock).mockRejectedValue(new Error("config failed"));
  (agendaApi.staff as jest.Mock).mockRejectedValue(new Error("staff failed"));
  (agendaApi.people as jest.Mock).mockRejectedValue(new Error("people failed"));
  const ui = render(<TaskForm onSaved={jest.fn()} />);
  await screen.findByRole("alert");
  expect(screen.getByText("save")).toBeDisabled();
  ui.unmount();
});
it("updates derived settings with a stable retry key", async () => {
  const saved = jest.fn();
  (agendaApi.settings as jest.Mock).mockRejectedValueOnce(
    new Error("settings lost"),
  );
  const ui = render(
    <EntrySettings
      entry={entry({ scheduledAt: "2026-10-03T15:00:00Z" })}
      onSaved={saved}
    />,
  );
  await screen.findByText("Staff");
  change("responsible", "staff");
  change("reminderMinutes", "30");
  change("reminderHour", "10");
  fireEvent.submit(ui.container.querySelector("form")!);
  await screen.findByText("settings lost");
  fireEvent.submit(ui.container.querySelector("form")!);
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect((agendaApi.settings as jest.Mock).mock.calls[0][2]).toBe(
    (agendaApi.settings as jest.Mock).mock.calls[1][2],
  );
});
it("limits the agenda to internal users", () => {
  mockUser.role = "owner";
  render(<AgendaBoard />);
  expect(screen.getByText("internalOnly")).toBeInTheDocument();
  expect(agendaApi.list).not.toHaveBeenCalled();
});
it("filters, pages, switches calendar views and navigates a created task", async () => {
  render(<AgendaBoard />);
  await screen.findByText("Call Ana");
  change("search", "Ana");
  change("kind", "call");
  change("status", "all");
  change("responsible", "staff");
  change("person", "owner:ana");
  await waitFor(() =>
    expect(agendaApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: "Ana",
        kind: "call",
        status: "all",
        responsibleUserId: "staff",
        personId: "ana",
      }),
    ),
  );
  fireEvent.click(screen.getByText("next"));
  await waitFor(() =>
    expect(agendaApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    ),
  );
  fireEvent.click(screen.getByText("previous"));
  change("view", "week");
  change("date", "2026-10-03");
  await screen.findByText("Call Ana");
  change("view", "month");
  change("view", "day");
  fireEvent.click(screen.getByText("today"));
  fireEvent.click(screen.getByText("unscheduled"));
  await waitFor(() =>
    expect(agendaApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ unscheduled: "true" }),
    ),
  );
  fireEvent.click(screen.getByText("refresh"));
  fireEvent.click(screen.getByText("newTask"));
  await waitFor(() => expect(screen.getByText("save")).toBeEnabled());
  change("title", "New");
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith("/agenda/entries/task%3Anew"),
  );
  fireEvent.click(screen.getByText("close"));
});
it("reports list loading errors and recovers on refresh", async () => {
  (agendaApi.list as jest.Mock).mockRejectedValueOnce(new Error("list failed"));
  render(<AgendaBoard />);
  await screen.findByText("list failed");
  fireEvent.click(screen.getByText("refresh"));
  expect(await screen.findByText("Call Ana")).toBeVisible();
});
it("shows person history and completes, cancels and edits a task", async () => {
  (agendaApi.entry as jest.Mock).mockResolvedValue(
    entry({ personType: "owner", personId: "ana" }),
  );
  render(<AgendaDetail id="task:one" />);
  await screen.findByText("history");
  expect(screen.getByRole("link", { name: "+54911" })).toHaveAttribute(
    "href",
    "tel:+54911",
  );
  fireEvent.click(screen.getByText("complete"));
  await waitFor(() =>
    expect(agendaApi.update).toHaveBeenCalledWith(
      "task:one",
      { version: 1, status: "completed" },
      expect.any(String),
    ),
  );
  await screen.findByText("history");
  fireEvent.click(screen.getByText("cancelTask"));
  await waitFor(() =>
    expect(agendaApi.update).toHaveBeenLastCalledWith(
      "task:one",
      { version: 1, status: "cancelled" },
      expect.any(String),
    ),
  );
  fireEvent.click(screen.getByText("edit"));
  await screen.findByRole("form");
  fireEvent.click(screen.getByText("edit"));
  fireEvent.click(screen.getByText("newFollowup"));
  await screen.findByRole("form");
  fireEvent.click(screen.getByText("newFollowup"));
});
it.each(["property", "maintenance", "sale", "lease", "invoice"])(
  "links a derived %s entry to its originating module",
  async (sourceType) => {
    (agendaApi.entry as jest.Mock).mockResolvedValue(
      entry({
        id: "visit:one",
        kind: "visit",
        editable: false,
        sourceType,
        sourceId: "source",
        scheduledDate: null,
        scheduledAt: "2026-10-03T15:00:00Z",
      }),
    );
    render(<AgendaDetail id="visit:one" />);
    await screen.findByText("derived");
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("openSource").getAttribute("href")).toContain(
      "/es/",
    );
    fireEvent.click(screen.getByText("edit"));
    await screen.findByText("save");
  },
);
it("creates followups from a person and handles unavailable people or entries", async () => {
  const ui = render(<AgendaDetail personType="owner" personId="ana" />);
  await screen.findByRole("form");
  expect(screen.getByRole("heading", { name: "Ana" })).toBeInTheDocument();
  ui.unmount();
  (agendaApi.person as jest.Mock).mockResolvedValue(null);
  render(<AgendaDetail personType="owner" personId="missing" />);
  await screen.findByText("personUnavailable");
});
it("shows action and entry errors", async () => {
  (agendaApi.update as jest.Mock).mockRejectedValue(new Error("update failed"));
  const ui = render(<AgendaDetail id="task:one" />);
  await screen.findByText("history");
  fireEvent.click(screen.getByText("complete"));
  await screen.findByText("update failed");
  fireEvent.click(screen.getByText("cancelTask"));
  await screen.findByText("update failed");
  ui.unmount();
  (agendaApi.entry as jest.Mock).mockRejectedValue(new Error("entry failed"));
  render(<AgendaDetail id="missing" />);
  expect(await screen.findByText("entry failed")).toBeVisible();
});
it("loads the inbox, updates preferences, marks read and pages notifications", async () => {
  render(<NotificationBell />);
  const bell = await screen.findByRole("button", { name: "notifications (1)" });
  fireEvent.click(bell);
  await screen.findByText("Notice");
  fireEvent.click(screen.getByText("markRead"));
  await waitFor(() => expect(noticesApi.read).toHaveBeenCalledWith("notice"));
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() =>
    expect(noticesApi.setPreferences).toHaveBeenCalledWith([
      { event: "assigned", enabled: false },
    ]),
  );
  fireEvent.click(screen.getByText("next"));
  await waitFor(() => expect(noticesApi.list).toHaveBeenLastCalledWith(2));
  fireEvent.click(screen.getByText("previous"));
  fireEvent.click(screen.getByText("enablePush"));
  await waitFor(() => expect(enableWebPush).toHaveBeenCalled());
  fireEvent.click(screen.getByText("disablePush"));
  await waitFor(() => expect(disableWebPush).toHaveBeenCalled());
  fireEvent.click(screen.getByText("Notice"));
  expect(mockPush).toHaveBeenCalledWith("/notifications/notice");
  fireEvent.click(bell);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByText("Notice")).not.toBeInTheDocument();
});
it("surfaces denied push and inbox action failures", async () => {
  (enableWebPush as jest.Mock).mockResolvedValue(false);
  (disableWebPush as jest.Mock).mockRejectedValue(new Error("disable failed"));
  (noticesApi.read as jest.Mock).mockRejectedValue(new Error("read failed"));
  (noticesApi.setPreferences as jest.Mock).mockRejectedValue(
    new Error("prefs failed"),
  );
  render(<NotificationBell />);
  fireEvent.click(
    await screen.findByRole("button", { name: "notifications (1)" }),
  );
  await screen.findByText("Notice");
  fireEvent.click(screen.getByText("enablePush"));
  await screen.findByText("pushDenied");
  fireEvent.click(screen.getByText("disablePush"));
  await screen.findByText("disable failed");
  fireEvent.click(screen.getByText("markRead"));
  await screen.findByText("read failed");
  fireEvent.click(screen.getByRole("checkbox"));
  expect(await screen.findByText("prefs failed")).toBeVisible();
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
});
