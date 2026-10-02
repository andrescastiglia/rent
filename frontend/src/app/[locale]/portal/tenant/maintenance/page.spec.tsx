import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TenantMaintenancePage from "./page";
import { maintenanceApi } from "@/lib/api/maintenance";
import { leasesApi } from "@/lib/api/leases";
import { propertiesApi } from "@/lib/api/properties";
let mockRole = "tenant";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));
jest.mock("@/lib/api/maintenance", () => ({
  maintenanceApi: { getAll: jest.fn(), create: jest.fn() },
}));
jest.mock("@/lib/api/leases", () => ({ leasesApi: { getAll: jest.fn() } }));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getAll: jest.fn() },
}));
jest.mock("@/components/documents/MaintenanceAttachments", () => ({
  __esModule: true,
  default: ({ ticketId }: { ticketId: string }) => (
    <section aria-label="Attachments">{ticketId}</section>
  ),
}));
jest.mock("@/components/maintenance/TicketConversation", () => ({
  __esModule: true,
  default: ({ ticketId }: { ticketId: string }) => (
    <section aria-label="Conversation">{ticketId}</section>
  ),
}));
const api = jest.mocked(maintenanceApi),
  leases = jest.mocked(leasesApi),
  properties = jest.mocked(propertiesApi);
const ticket = {
  id: "ticket",
  title: "Pérdida de agua",
  description: "Bajo mesada",
  resolutionNotes: "Reparación coordinada",
  status: "open",
  createdAt: "2026-10-01T12:00:00Z",
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "tenant";
  api.getAll.mockResolvedValue([ticket] as never);
  api.create.mockResolvedValue({} as never);
  leases.getAll.mockResolvedValue([
    { propertyId: "property", property: { name: "Casa" } },
  ] as never);
  properties.getAll.mockResolvedValue([
    { id: "owned-property", name: "Casa propia" },
  ] as never);
});
function fillRequest() {
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "  Falta de agua  " },
  });
  fireEvent.change(screen.getByLabelText("description"), {
    target: { value: "  Revisar conexión  " },
  });
  fireEvent.change(screen.getByLabelText("area"), {
    target: { value: "plumbing" },
  });
  fireEvent.change(screen.getByLabelText("priority"), {
    target: { value: "high" },
  });
}
it("uses active contracts for tenant requests and shows scoped conversation and attachments", async () => {
  render(<TenantMaintenancePage />);
  await screen.findByText("Pérdida de agua");
  expect(leases.getAll).toHaveBeenCalledWith({ status: "ACTIVE" });
  expect(properties.getAll).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "open" }));
  expect(screen.getByRole("region", { name: "Attachments" })).toHaveTextContent(
    "ticket",
  );
  expect(
    screen.getByRole("region", { name: "Conversation" }),
  ).toHaveTextContent("ticket");
  expect(screen.getByText("Reparación coordinada")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  expect(
    screen.queryByRole("region", { name: "Attachments" }),
  ).not.toBeInTheDocument();
  fillRequest();
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await screen.findByText("success");
  expect(api.create).toHaveBeenCalledWith({
    propertyId: "property",
    title: "Falta de agua",
    description: "Revisar conexión",
    area: "plumbing",
    priority: "high",
    source: "tenant",
  });
});
it("uses owned properties even without active leases for owner requests", async () => {
  mockRole = "owner";
  render(<TenantMaintenancePage />);
  await screen.findByText("Pérdida de agua");
  expect(properties.getAll).toHaveBeenCalledTimes(1);
  expect(leases.getAll).not.toHaveBeenCalled();
  fillRequest();
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await screen.findByText("success");
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({ propertyId: "owned-property", source: "owner" }),
  );
});
it("keeps unreadable requests separate from empty results and explicitly retries", async () => {
  api.getAll
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([]);
  leases.getAll.mockResolvedValue([]);
  render(<TenantMaintenancePage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("readError");
  expect(screen.queryByText("empty")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("noLease");
  expect(screen.getByText("empty")).toBeInTheDocument();
});
it("preserves an uncertain request and never submits it automatically", async () => {
  api.create.mockRejectedValueOnce(new Error("response lost"));
  render(<TenantMaintenancePage />);
  await screen.findByText("Pérdida de agua");
  fillRequest();
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await screen.findByRole("button", { name: "recover" });
  expect(screen.getByLabelText("title")).toBeDisabled();
  expect(api.create).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await screen.findByText("success");
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
  expect(api.create.mock.calls[1][0]).toEqual(api.create.mock.calls[0][0]);
});
