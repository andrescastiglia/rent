import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Page from "./page";
import { maintenanceApi } from "@/lib/api/maintenance";
import type { User } from "@/types/auth";
import {
  MaintenanceTicketArea,
  MaintenanceTicketPriority,
  MaintenanceTicketSource,
  MaintenanceTicketStatus,
  type MaintenanceTicket,
} from "@/types/maintenance";

const mockTranslate = (key: string) => key;
const mockReplace = jest.fn();
let mockUser: User | null;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));
jest.mock("@/lib/api/maintenance", () => ({
  maintenanceApi: {
    getAll: jest.fn(),
    getComments: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    addComment: jest.fn(),
  },
}));
jest.mock("@/components/documents/MaintenanceAttachments", () => ({
  __esModule: true,
  default: ({ ticketId }: { ticketId: string }) => (
    <div data-testid="attachments">{ticketId}</div>
  ),
}));

const api = jest.mocked(maintenanceApi);
const ticket: MaintenanceTicket = {
  id: "ticket",
  companyId: "company",
  propertyId: "property",
  title: "Repair kitchen",
  area: MaintenanceTicketArea.KITCHEN,
  priority: MaintenanceTicketPriority.HIGH,
  status: MaintenanceTicketStatus.OPEN,
  source: MaintenanceTicketSource.TENANT,
  costCurrency: "ARS",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    id: "admin",
    role: "admin",
    email: null,
    firstName: "Admin",
    lastName: "",
    permissions: {},
  };
  api.getAll.mockResolvedValue([ticket]);
  api.getComments.mockResolvedValue([]);
  api.create.mockResolvedValue({ ...ticket, id: "new", title: "New repair" });
  api.update.mockResolvedValue({
    ...ticket,
    status: MaintenanceTicketStatus.RESOLVED,
  });
  api.addComment.mockResolvedValue({
    id: "comment",
    ticketId: ticket.id,
    body: "Pending parts",
    isInternal: false,
    createdAt: "2026-10-02",
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

async function mount() {
  render(<Page />);
  await screen.findByRole("button", { name: ticket.title });
}
async function details() {
  fireEvent.click(screen.getByRole("button", { name: ticket.title }));
  await waitFor(() => expect(api.getComments).toHaveBeenCalledWith(ticket.id));
}
async function openCreate() {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "newTicket" }));
}
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

it("uses server filters and provides a keyboard reachable ticket control", async () => {
  await mount();
  expect(screen.getByRole("button", { name: ticket.title })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  change("status", "assigned");
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith({
      status: "assigned",
      priority: undefined,
      search: undefined,
    }),
  );
  change("priority", "urgent");
  change("search", "later-page");
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith({
      status: "assigned",
      priority: "urgent",
      search: "later-page",
    }),
  );
  await details();
  expect(screen.getByRole("button", { name: ticket.title })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByTestId("attachments")).toHaveTextContent("ticket");
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  expect(screen.queryByText("ticketDetails")).not.toBeInTheDocument();
  await details();
  fireEvent.click(screen.getByRole("button", { name: ticket.title }));
  expect(screen.queryByText("ticketDetails")).not.toBeInTheDocument();
});

it("allows staff with maintenance permission and denies staff without it before querying", async () => {
  mockUser = {
    ...mockUser!,
    role: "staff",
    permissions: { maintenance: true },
  };
  const view = render(<Page />);
  await screen.findByRole("button", { name: ticket.title });
  expect(screen.getByRole("button", { name: "newTicket" })).toBeVisible();
  view.unmount();
  api.getAll.mockClear();
  mockUser = { ...mockUser!, permissions: { maintenance: false } };
  render(<Page />);
  expect(screen.getByText("accessDenied")).toBeVisible();
  expect(api.getAll).not.toHaveBeenCalled();
});

it.each(["tenant", "owner", "buyer"] as const)(
  "does not load internal maintenance data for %s",
  (role) => {
    mockUser = { ...mockUser!, role };
    render(<Page />);
    expect(screen.getByText("accessDenied")).toBeVisible();
    expect(api.getAll).not.toHaveBeenCalled();
  },
);

it("does not load data before authentication is available", () => {
  mockUser = null;
  render(<Page />);
  expect(api.getAll).not.toHaveBeenCalled();
});

it("distinguishes loading failures from an empty list and retries successfully", async () => {
  api.getAll
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([]);
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent("errors.load");
  expect(screen.queryByText("noTickets")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  expect(await screen.findByText("noTickets")).toBeVisible();
  expect(screen.getByText("noTicketsDescription")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("creates a ticket with optional costs and dates and displays the persisted result", async () => {
  await openCreate();
  change("title", "New repair");
  change("property", "property-2");
  change("area", "electrical");
  change("priority", "urgent");
  change("description", "Replace cable");
  change("estimatedCost", "12.50");
  change("scheduledAt", "2026-10-02");
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  expect(await screen.findByText("messages.created")).toBeVisible();
  expect(api.create).toHaveBeenCalledWith({
    title: "New repair",
    propertyId: "property-2",
    area: "electrical",
    priority: "urgent",
    description: "Replace cable",
    estimatedCost: 12.5,
    scheduledAt: "2026-10-02",
    source: "admin",
  });
  expect(screen.getByRole("button", { name: "New repair" })).toBeVisible();
});

it("preserves entered values after a failed save and keeps submission disabled in flight", async () => {
  let reject!: (reason: Error) => void;
  api.create.mockReturnValueOnce(
    new Promise((_resolve, failure) => {
      reject = failure;
    }),
  );
  await openCreate();
  change("title", "Kept title");
  change("property", "property-2");
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  expect(screen.getByRole("button", { name: "saving" })).toBeDisabled();
  await act(async () => reject(new Error("offline")));
  expect(await screen.findByRole("alert")).toHaveTextContent("errors.save");
  expect(screen.getByLabelText("title")).toHaveValue("Kept title");
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await screen.findByText("messages.created");
  expect(api.create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      description: undefined,
      estimatedCost: undefined,
      scheduledAt: undefined,
    }),
  );
});

it("cancels the create form and starts again with clean fields", async () => {
  await openCreate();
  change("title", "Discarded");
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "newTicket" }));
  expect(screen.getByLabelText("title")).toHaveValue("");
  expect(api.create).not.toHaveBeenCalled();
});

it("renders assigned people, monetary details, public and internal comment history", async () => {
  api.getAll.mockResolvedValue([
    {
      ...ticket,
      property: { id: "property", address: "Main 123" },
      reportedBy: {
        id: "user",
        firstName: "Ana",
        lastName: "Pérez",
        email: "ana@example.com",
      },
      assignedStaff: {
        id: "staff",
        user: { firstName: "Luis", lastName: "Díaz" },
      },
      estimatedCost: 100,
      actualCost: 80,
      scheduledAt: "2026-10-02",
      resolvedAt: "2026-10-03",
      description: "Broken sink",
      resolutionNotes: "Replaced",
      externalRef: "EXT1",
    },
  ]);
  api.getComments.mockResolvedValue([
    {
      id: "public",
      ticketId: ticket.id,
      body: "Public reply",
      isInternal: false,
      createdAt: "2026-10-02",
    },
    {
      id: "internal",
      ticketId: ticket.id,
      user: { firstName: "Staff", lastName: "Name" },
      body: "Internal evidence",
      isInternal: true,
      createdAt: "2026-10-02",
    },
  ]);
  await mount();
  await details();
  expect(await screen.findByText("Internal evidence")).toBeVisible();
  expect(screen.getByText("Public reply")).toBeVisible();
  expect(screen.getAllByText("Main 123")).toHaveLength(2);
  expect(screen.getByText("Ana Pérez")).toBeVisible();
  expect(screen.getByText("80 ARS")).toBeVisible();
  expect(screen.getByText("Broken sink")).toBeVisible();
  expect(screen.getByText("Replaced")).toBeVisible();
  expect(screen.getByText("EXT1")).toBeVisible();
});

it("updates the ticket status and keeps unchanged updates disabled", async () => {
  await mount();
  await details();
  expect(screen.getByRole("button", { name: "updateStatus" })).toBeDisabled();
  fireEvent.change(
    screen.getByLabelText("status", { selector: "#maintenance-ticket-status" }),
    { target: { value: "resolved" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "updateStatus" }));
  expect(await screen.findByText("messages.updated")).toBeVisible();
  expect(api.update).toHaveBeenCalledWith(ticket.id, { status: "resolved" });
  expect(screen.getByRole("button", { name: "updateStatus" })).toBeDisabled();
});

it("shows a failed status update without pretending the ticket changed", async () => {
  api.update.mockRejectedValueOnce(new Error("offline"));
  await mount();
  await details();
  fireEvent.change(
    screen.getByLabelText("status", { selector: "#maintenance-ticket-status" }),
    { target: { value: "closed" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "updateStatus" }));
  expect(await screen.findByText("errors.updateStatus")).toBeVisible();
  expect(screen.queryByText("messages.updated")).not.toBeInTheDocument();
});

it("reports comment load failures and preserves a failed comment for retry", async () => {
  api.getComments.mockRejectedValueOnce(new Error("offline"));
  api.addComment.mockRejectedValueOnce(new Error("offline"));
  await mount();
  await details();
  await screen.findByText("errors.loadComments");
  expect(screen.getByRole("button", { name: "submitComment" })).toBeDisabled();
  change("addComment", "  Pending parts  ");
  fireEvent.click(screen.getByRole("button", { name: "submitComment" }));
  await screen.findByText("errors.addComment");
  expect(screen.getByLabelText("addComment")).toHaveValue("  Pending parts  ");
  fireEvent.click(screen.getByRole("button", { name: "submitComment" }));
  await screen.findByText("Pending parts");
  expect(api.addComment).toHaveBeenLastCalledWith(
    ticket.id,
    "Pending parts",
    false,
  );
  expect(screen.getByLabelText("addComment")).toHaveValue("");
});

it("records an explicitly internal comment and prevents empty comments", async () => {
  await mount();
  await details();
  const field = screen.getByLabelText("addComment");
  fireEvent.submit(field.closest("form")!);
  expect(api.addComment).not.toHaveBeenCalled();
  change("addComment", "Note");
  fireEvent.click(screen.getByRole("checkbox", { name: "internalComment" }));
  fireEvent.click(screen.getByRole("button", { name: "submitComment" }));
  await waitFor(() =>
    expect(api.addComment).toHaveBeenCalledWith(ticket.id, "Note", true),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("addComment")).toHaveValue(""),
  );
});

it("ignores comment responses after closing a ticket", async () => {
  let resolve!: (value: never[]) => void;
  api.getComments.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await mount();
  await details();
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  await act(async () => resolve([]));
  expect(screen.queryByText("ticketDetails")).not.toBeInTheDocument();
});

it("keeps the latest server search results when older requests arrive afterward", async () => {
  await mount();
  let resolve!: (value: MaintenanceTicket[]) => void;
  api.getAll.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  change("search", "older");
  api.getAll.mockResolvedValueOnce([
    { ...ticket, id: "latest", title: "Latest match" },
  ]);
  change("search", "latest");
  expect(
    await screen.findByRole("button", { name: "Latest match" }),
  ).toBeVisible();
  await act(async () => resolve([{ ...ticket, title: "Stale match" }]));
  expect(screen.getByRole("button", { name: "Latest match" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Stale match" }),
  ).not.toBeInTheDocument();
});
