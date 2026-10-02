import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StaffPage from "./page";
import StaffLayout from "./layout";
import { staffApi } from "@/lib/api/staff";
import type { Staff } from "@/types/staff";
let mockRole = "admin";
jest.mock("next-intl", () => {
  const translate = (key: string) => key;
  return { useTranslations: () => translate };
});
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { role: mockRole } }),
}));
jest.mock("@/components/common/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) =>
    mockRole === "admin" || mockRole === "staff" ? children : <p>Sin acceso</p>,
}));
jest.mock("@/components/layout/MainLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
jest.mock("@/lib/api/staff", () => ({
  staffApi: {
    getAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    activate: jest.fn(),
  },
}));
const api = jest.mocked(staffApi);
const person = {
  id: "staff1",
  userId: "user1",
  companyId: "company",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  user: {
    id: "user1",
    firstName: "Ana",
    lastName: "Pérez",
    email: "ana@example.test",
    phone: "123456",
    isActive: true,
  },
  specialization: "maintenance",
  hourlyRate: 12.75,
  currency: "ARS",
  notes: "Profesional",
  totalJobs: 8,
  deletedAt: undefined,
} satisfies Staff;
const second = {
  ...person,
  id: "staff2",
  user: { firstName: null, lastName: null, email: null, isActive: false },
  specialization: "other",
  hourlyRate: null,
  notes: null,
  deletedAt: "2026-01-01",
} as unknown as Staff;
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "admin";
  api.getAll.mockResolvedValue([person, second]);
  api.create.mockResolvedValue({ ...person, id: "created" });
  api.update.mockResolvedValue({
    ...person,
    user: { ...person.user, firstName: "Actualizada" },
  });
  api.remove.mockResolvedValue(undefined);
  api.activate.mockResolvedValue({
    ...second,
    deletedAt: undefined,
    user: { ...second.user, isActive: true },
  });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
it("shows activity, inactive profiles and sends filters to the server", async () => {
  render(<StaffPage />);
  await screen.findByText("Ana Pérez");
  expect(screen.getByText("12.75 ARS")).toBeInTheDocument();
  expect(screen.getByText("inactive")).toBeInTheDocument();
  expect(screen.getAllByText("specializations.other")).toHaveLength(2);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "legal" },
  });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Ana" } });
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith({
      specialization: "legal",
      search: "Ana",
    }),
  );
});
it("creates a staff profile with all supported form values and preserved decimals", async () => {
  render(<StaffPage />);
  await screen.findByText("Ana Pérez");
  fireEvent.click(screen.getByRole("button", { name: "newStaff" }));
  for (const [label, value] of [
    ["firstName", "Nora"],
    ["lastName", "López"],
    ["email", "nora@example.test"],
    ["phone", "112233"],
    ["specialization", "accounting"],
    ["hourlyRate", "15.25"],
    ["currency", "USD"],
    ["notes", "Notas"],
  ])
    change(label, value);
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await screen.findByText("messages.created");
  expect(api.create).toHaveBeenCalledWith({
    firstName: "Nora",
    lastName: "López",
    email: "nora@example.test",
    phone: "112233",
    specialization: "accounting",
    hourlyRate: 15.25,
    currency: "USD",
    notes: "Notas",
  });
  expect(screen.queryByLabelText("firstName")).not.toBeInTheDocument();
});
it("edits existing supported values, replaces only the matching row and can cancel without saving", async () => {
  render(<StaffPage />);
  await screen.findByText("Ana Pérez");
  fireEvent.click(screen.getAllByRole("button", { name: "edit" })[0]);
  expect(screen.getByLabelText("hourlyRate")).toHaveValue(12.75);
  expect(screen.getByLabelText("notes")).toHaveValue("Profesional");
  change("firstName", "Actualizada");
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("messages.updated");
  expect(api.update).toHaveBeenCalledWith(
    "staff1",
    expect.objectContaining({ firstName: "Actualizada" }),
  );
  expect(screen.getByText("Actualizada Pérez")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "edit" })[1]);
  expect(screen.getByLabelText("firstName")).toHaveValue("");
  expect(screen.getByLabelText("hourlyRate")).toHaveValue(null);
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(api.update).toHaveBeenCalledTimes(1);
});
it("uses optional fields and default currency without adding unsupported data", async () => {
  render(<StaffPage />);
  await screen.findByText("Ana Pérez");
  fireEvent.click(screen.getByRole("button", { name: "newStaff" }));
  change("firstName", "Nora");
  change("lastName", "López");
  change("currency", "");
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await screen.findByText("messages.created");
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({
      email: undefined,
      phone: undefined,
      hourlyRate: undefined,
      notes: undefined,
      currency: "USD",
    }),
  );
});
it("retains entered staff data after a failed save and retries only explicitly", async () => {
  api.create.mockRejectedValueOnce(new Error("offline"));
  render(<StaffPage />);
  await screen.findByText("Ana Pérez");
  fireEvent.click(screen.getByRole("button", { name: "newStaff" }));
  change("firstName", "Nora");
  change("lastName", "López");
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await screen.findByText("errors.save");
  expect(screen.getByLabelText("firstName")).toHaveValue("Nora");
  expect(api.create).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await screen.findByText("messages.created");
  expect(api.create).toHaveBeenCalledTimes(2);
});
it("deactivates and explicitly reactivates profiles without affecting unrelated records", async () => {
  render(<StaffPage />);
  await screen.findByText("Ana Pérez");
  fireEvent.click(screen.getByRole("button", { name: "deactivate" }));
  await screen.findByText("messages.deactivated");
  expect(api.remove).toHaveBeenCalledWith("staff1");
  expect(screen.getAllByText("inactive")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "activate" })[1]);
  await screen.findByText("messages.activated");
  expect(api.activate).toHaveBeenCalledWith("staff2");
  expect(screen.getByText("inactive")).toBeInTheDocument();
});
it("shows failed activation while preserving the current profile state", async () => {
  api.remove.mockRejectedValueOnce(new Error("offline"));
  render(<StaffPage />);
  await screen.findByText("Ana Pérez");
  fireEvent.click(screen.getByRole("button", { name: "deactivate" }));
  await screen.findByText("errors.activation");
  expect(
    screen.getByRole("button", { name: "deactivate" }),
  ).toBeInTheDocument();
});
it("shows an honest empty staff collection and a distinct load failure", async () => {
  api.getAll.mockResolvedValueOnce([]);
  const view = render(<StaffPage />);
  await screen.findByText("noStaff");
  expect(screen.getByText("noStaffDescription")).toBeInTheDocument();
  view.unmount();
  api.getAll.mockRejectedValueOnce(new Error("offline"));
  render(<StaffPage />);
  await screen.findByText("errors.load");
});
it("keeps staff read-only and hides administrative controls from external users", async () => {
  mockRole = "staff";
  const view = render(<StaffPage />);
  await screen.findByText("Ana Pérez");
  expect(
    screen.queryByRole("button", { name: "newStaff" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "edit" }),
  ).not.toBeInTheDocument();
  view.unmount();
  mockRole = "tenant";
  render(<StaffPage />);
  expect(screen.getByText("Sin acceso")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "create" }),
  ).not.toBeInTheDocument();
});
it("composes the staff shell with the application layout", () => {
  render(
    <StaffLayout>
      <p>Equipo</p>
    </StaffLayout>,
  );
  expect(screen.getByRole("main")).toHaveTextContent("Equipo");
});
