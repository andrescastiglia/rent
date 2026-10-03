import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Proposal from "@/app/[locale]/agenda/proposals/[id]/page";
import Destination from "@/app/[locale]/notifications/[id]/page";
import { apiClient } from "@/lib/api";
import { dashboardApi } from "@/lib/api/dashboard";
import { noticesApi } from "@/lib/api/agenda";
import { contactApi } from "@/lib/api/contact-data";
const mockReplace = jest.fn(),
  mockTranslate = (key: string) => key;
jest.mock("next/navigation", () => ({ useParams: () => ({ id: "proposal" }) }));
jest.mock("next-intl", () => ({ useTranslations: () => mockTranslate }));
jest.mock("@/lib/auth", () => ({ getToken: () => "token" }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => ({ replace: mockReplace }),
}));
jest.mock("@/components/layout/MainLayout", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/common/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/contact-data/GeoCard", () => ({
  GeoCard: () => <div>Visit map</div>,
}));
jest.mock("@/components/ai/PendingActionReviewDialog", () => ({
  __esModule: true,
  default: ({
    item,
    onPasswordChange,
    onConfirm,
    onCancel,
  }: {
    item: unknown;
    onPasswordChange: (v: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    item ? (
      <div>
        <input
          aria-label="password"
          onChange={(e) => onPasswordChange(e.target.value)}
        />
        <button onClick={onConfirm}>confirm</button>
        <button onClick={onCancel}>close</button>
      </div>
    ) : null,
}));
jest.mock("@/lib/api", () => ({ apiClient: { get: jest.fn() } }));
jest.mock("@/lib/api/dashboard", () => ({
  dashboardApi: {
    reauthenticate: jest.fn(),
    approvePendingAction: jest.fn(),
    rejectPendingAction: jest.fn(),
  },
}));
jest.mock("@/lib/api/agenda", () => ({
  noticesApi: { destination: jest.fn(), read: jest.fn() },
}));
jest.mock("@/lib/api/contact-data", () => ({
  contactApi: { config: jest.fn(), entry: jest.fn() },
}));
beforeEach(() => {
  jest.resetAllMocks();
  (apiClient.get as jest.Mock).mockResolvedValue({
    id: "proposal",
    summary: "Visit Ana",
    status: "pending",
    canRetry: false,
  });
  (dashboardApi.reauthenticate as jest.Mock).mockResolvedValue("reauth-token");
  (noticesApi.destination as jest.Mock).mockResolvedValue({
    path: "/agenda/entries/task%3Aone",
  });
  (contactApi.config as jest.Mock).mockResolvedValue({ maps: true });
  (contactApi.entry as jest.Mock).mockResolvedValue({ id: "place" });
});
it("requires a password, approves and opens the task only after executed confirmation", async () => {
  (apiClient.get as jest.Mock)
    .mockResolvedValueOnce({ summary: "Visit Ana", status: "pending" })
    .mockResolvedValue({
      summary: "Visit Ana",
      status: "executed",
      result: { id: "task:one" },
    });
  render(<Proposal />);
  await screen.findByText("confirm");
  fireEvent.click(screen.getByText("confirm"));
  expect(dashboardApi.reauthenticate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("password"), {
    target: { value: "password" },
  });
  fireEvent.click(screen.getByText("confirm"));
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith("/agenda/entries/task%3Aone"),
  );
  expect(dashboardApi.approvePendingAction).toHaveBeenCalledWith(
    "proposal",
    "reauth-token",
  );
});
it("closes and reopens reviews and rejects without reauthentication", async () => {
  render(<Proposal />);
  await screen.findByText("confirm");
  fireEvent.click(screen.getByText("close"));
  expect(screen.queryByText("confirm")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("peopleActivity.actions.approve"));
  await screen.findByText("confirm");
  fireEvent.click(screen.getByText("peopleActivity.actions.reject"));
  await screen.findByText("rejected");
  expect(dashboardApi.reauthenticate).not.toHaveBeenCalled();
});
it("retains actionable failed proposals and surfaces rejection errors", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    summary: "Visit Ana",
    status: "failed",
    canRetry: true,
    errorMessage: "write failed",
  });
  render(<Proposal />);
  await screen.findByText("confirm");
  fireEvent.change(screen.getByLabelText("password"), {
    target: { value: "password" },
  });
  fireEvent.click(screen.getByText("confirm"));
  await screen.findByText("write failed");
  (dashboardApi.rejectPendingAction as jest.Mock).mockRejectedValue(
    new Error("reject failed"),
  );
  fireEvent.click(screen.getByText("peopleActivity.actions.reject"));
  expect(await screen.findByText("reject failed")).toBeVisible();
});
it("reports missing proposals", async () => {
  (apiClient.get as jest.Mock).mockRejectedValue(new Error("not found"));
  render(<Proposal />);
  expect(await screen.findByText("not found")).toBeVisible();
});
it("marks notifications read and recovers their current destination", async () => {
  render(<Destination />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith("/agenda/entries/task%3Aone"),
  );
  expect(noticesApi.read).toHaveBeenCalledWith("proposal");
});
it("offers visit maps and deliberate followup navigation", async () => {
  (noticesApi.destination as jest.Mock).mockResolvedValue({
    path: "/agenda/entries/visit",
    kind: "visit",
    entryId: "visit:one",
  });
  render(<Destination />);
  await screen.findByText("Visit map");
  fireEvent.click(screen.getByText("Abrir seguimiento de la visita"));
  expect(mockReplace).toHaveBeenCalledWith("/agenda/entries/visit");
});
it("falls back to followup when the map destination is unavailable", async () => {
  (noticesApi.destination as jest.Mock).mockResolvedValue({
    path: "/agenda/entries/visit",
    kind: "visit",
    entryId: "visit:one",
  });
  (contactApi.entry as jest.Mock).mockRejectedValue(new Error("unavailable"));
  render(<Destination />);
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith("/agenda/entries/visit"),
  );
});
it("shows destination errors", async () => {
  (noticesApi.destination as jest.Mock).mockRejectedValue("offline");
  render(<Destination />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo abrir el aviso",
  );
});
