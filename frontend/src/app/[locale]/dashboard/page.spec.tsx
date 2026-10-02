import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import DashboardPage from "./page";
import { dashboardApi, type PersonActivityItem } from "@/lib/api/dashboard";

let mockAuthLoading = false;
const mockTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: mockAuthLoading }),
}));
jest.mock("@/lib/api/dashboard", () => ({
  dashboardApi: {
    getOperationsOverview: jest.fn(),
    getRecentActivity: jest.fn(),
    completePersonActivity: jest.fn(),
    updatePersonActivityComment: jest.fn(),
    replyCommunication: jest.fn(),
    markCommunicationRead: jest.fn(),
    rejectPendingAction: jest.fn(),
    reauthenticate: jest.fn(),
    approvePendingAction: jest.fn(),
  },
}));
jest.mock("@/components/ai/PendingActionReviewDialog", () => ({
  __esModule: true,
  default: ({
    item,
    password,
    error,
    busy,
    onPasswordChange,
    onCancel,
    onConfirm,
  }: {
    item: { subject: string } | null;
    password: string;
    error: string | null;
    busy: boolean;
    onPasswordChange: (value: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    item ? (
      <section aria-label="Revisión">
        <h2>{item.subject}</h2>
        <label>
          Clave
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} onClick={onConfirm}>
          Confirmar propuesta
        </button>
        <button onClick={onCancel}>Cerrar revisión</button>
      </section>
    ) : null,
}));

const api = jest.mocked(dashboardApi);
const activity: PersonActivityItem = {
  id: "activity",
  personId: "person",
  personName: "Ana Pérez",
  sourceType: "interested",
  personType: "interested",
  subject: "Visitar inmueble",
  body: "Coordinar horario",
  status: "pending",
  dueAt: "2026-10-02T15:00:00Z",
  completedAt: null,
  propertyId: "property",
  propertyName: "Casa Centro",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
};
const overview = {
  propertiesPanel: {
    saleCount: 2,
    rentalActiveCount: 3,
    expiringThisMonthCount: 1,
    expiringThisMonth: [
      { leaseId: "lease", propertyName: "Casa Centro", endDate: "2026-10-31" },
    ],
  },
  paymentsPanel: {
    overdueInvoices: 4,
    recentPayments: [
      {
        paymentId: "payment",
        propertyName: "Casa Sur",
        amount: 1250.75,
        currencyCode: "USD",
        paymentDate: "2026-10-01",
      },
    ],
  },
};
const activities = (item: PersonActivityItem = activity) => ({
  new: [],
  overdue: [item],
  today: [],
  total: 1,
});
beforeEach(() => {
  jest.clearAllMocks();
  mockAuthLoading = false;
  api.getOperationsOverview.mockResolvedValue(overview as never);
  api.getRecentActivity.mockResolvedValue(activities() as never);
  api.reauthenticate.mockResolvedValue("reauth");
  for (const operation of [
    api.completePersonActivity,
    api.updatePersonActivityComment,
    api.replyCommunication,
    api.markCommunicationRead,
    api.rejectPendingAction,
    api.approvePendingAction,
  ])
    operation.mockResolvedValue(undefined as never);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => jest.restoreAllMocks());
const mount = async () => {
  const view = render(<DashboardPage />);
  await screen.findByText("Visitar inmueble");
  return view;
};

it("waits for authentication and displays compact metrics with links to the actual records", async () => {
  mockAuthLoading = true;
  const view = render(<DashboardPage />);
  expect(api.getOperationsOverview).not.toHaveBeenCalled();
  mockAuthLoading = false;
  view.rerender(<DashboardPage />);
  await screen.findByText("Visitar inmueble");
  expect(
    screen.getByText("workspace.overdueInvoices").nextElementSibling,
  ).toHaveTextContent("4");
  fireEvent.click(screen.getByText("workspace.information"));
  expect(screen.getByRole("link", { name: /Casa Centro ·/ })).toHaveAttribute(
    "href",
    "/es/leases/lease",
  );
  expect(screen.getByRole("link", { name: /Casa Sur/ })).toHaveAttribute(
    "href",
    "/es/payments/payment",
  );
  expect(
    screen.getByRole("link", { name: "workspace.openPayments" }),
  ).toHaveAttribute("data-guide", "attention");
});

it("distinguishes API failures from an empty task list and retries panels independently", async () => {
  api.getOperationsOverview.mockRejectedValueOnce(new Error("offline"));
  api.getRecentActivity.mockRejectedValueOnce(new Error("offline"));
  render(<DashboardPage />);
  await screen.findByText("loadError");
  await screen.findByText("activityError");
  expect(
    screen.queryByText("peopleActivity.noOverdue"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText("workspace.saleProperties").nextElementSibling,
  ).toHaveTextContent("—");
  fireEvent.click(
    within(screen.getByText("loadError").closest('[role="alert"]')!).getByRole(
      "button",
      { name: "retryPanel" },
    ),
  );
  await waitFor(() =>
    expect(api.getOperationsOverview).toHaveBeenCalledTimes(2),
  );
  expect(api.getRecentActivity).toHaveBeenCalledTimes(1);
  fireEvent.click(
    within(
      screen.getByText("activityError").closest('[role="alert"]')!,
    ).getByRole("button", { name: "retryPanel" }),
  );
  await screen.findByText("Visitar inmueble");
});

it("shows genuine empty sections without inventing tasks or movements", async () => {
  api.getOperationsOverview.mockResolvedValue({
    propertiesPanel: { expiringThisMonth: [] },
    paymentsPanel: { recentPayments: [] },
  } as never);
  api.getRecentActivity.mockResolvedValue({
    new: [],
    today: [],
    overdue: [],
    total: 0,
  });
  render(<DashboardPage />);
  await screen.findByText("peopleActivity.noOverdue");
  fireEvent.click(screen.getByText("workspace.information"));
  expect(screen.getByText("workspace.noEndings")).toBeVisible();
  expect(screen.getByText("workspace.noMovements")).toBeVisible();
});

it("changes the server activity limit and completes only the chosen task", async () => {
  await mount();
  fireEvent.change(screen.getByLabelText("peopleActivity.title"), {
    target: { value: "50" },
  });
  await waitFor(() =>
    expect(api.getRecentActivity).toHaveBeenLastCalledWith(50),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "peopleActivity.actions.complete" }),
  );
  await waitFor(() =>
    expect(api.completePersonActivity).toHaveBeenCalledWith(activity),
  );
  expect(api.getRecentActivity).toHaveBeenCalledTimes(3);
});

it("edits a comment, keeps the dialog open on error and cancels without a second mutation", async () => {
  api.updatePersonActivityComment.mockRejectedValueOnce(new Error("lost"));
  await mount();
  fireEvent.click(
    screen.getByRole("button", { name: "peopleActivity.actions.editComment" }),
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.change(
    within(dialog).getByLabelText("peopleActivity.editCommentTitle"),
    { target: { value: "Reprogramar" } },
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "peopleActivity.actions.save" }),
  );
  await screen.findByText("activityError");
  expect(dialog).toHaveAttribute("open");
  expect(api.updatePersonActivityComment).toHaveBeenCalledWith(
    activity,
    "Reprogramar",
  );
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "peopleActivity.actions.cancel",
    }),
  );
  expect(dialog).not.toHaveAttribute("open");
});

it("saves the comment then refreshes the task queue and restores focus", async () => {
  await mount();
  const trigger = screen.getByRole("button", {
    name: "peopleActivity.actions.editComment",
  });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "peopleActivity.actions.save" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(trigger).toHaveFocus();
  expect(api.getRecentActivity).toHaveBeenCalledTimes(2);
});

it.each(["reply", "read"])(
  "processes communication %s and refreshes the queue",
  async (kind) => {
    const item: PersonActivityItem = {
      ...activity,
      actionKind: "communication",
      actionId: "communication",
      body: null,
      propertyName: null,
      dueAt: null,
      status: "completed",
    };
    api.getRecentActivity.mockResolvedValue(activities(item) as never);
    jest.spyOn(window, "prompt").mockReturnValue(" Respuesta ");
    await mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: `peopleActivity.actions.${kind === "reply" ? "reply" : "markRead"}`,
      }),
    );
    await waitFor(() => expect(api.getRecentActivity).toHaveBeenCalledTimes(2));
    if (kind === "reply")
      expect(api.replyCommunication).toHaveBeenCalledWith(
        "communication",
        "Respuesta",
      );
    else
      expect(api.markCommunicationRead).toHaveBeenCalledWith("communication");
  },
);

it("ignores a cancelled communication response and surfaces a failed task mutation", async () => {
  api.getRecentActivity.mockResolvedValue(
    activities({
      ...activity,
      actionKind: "communication",
      actionId: "communication",
    }) as never,
  );
  jest.spyOn(window, "prompt").mockReturnValue(" ");
  const view = await mount();
  fireEvent.click(
    screen.getByRole("button", { name: "peopleActivity.actions.reply" }),
  );
  expect(api.replyCommunication).not.toHaveBeenCalled();
  view.unmount();
  api.getRecentActivity.mockResolvedValue(activities() as never);
  api.completePersonActivity.mockRejectedValueOnce(new Error("offline"));
  await mount();
  fireEvent.click(
    screen.getByRole("button", { name: "peopleActivity.actions.complete" }),
  );
  await screen.findByText("activityError");
});

it("rejects a pending proposal with the reviewed reason", async () => {
  api.getRecentActivity.mockResolvedValue(
    activities({
      ...activity,
      actionKind: "pending_action",
      actionId: "proposal",
      status: "cancelled",
    }) as never,
  );
  jest.spyOn(window, "prompt").mockReturnValue("No corresponde");
  await mount();
  fireEvent.click(
    screen.getByRole("button", { name: "peopleActivity.actions.reject" }),
  );
  await waitFor(() =>
    expect(api.rejectPendingAction).toHaveBeenCalledWith(
      "proposal",
      "No corresponde",
    ),
  );
});

it("requires reauthentication before approving and retains the proposal after a failed confirmation", async () => {
  api.getRecentActivity.mockResolvedValue(
    activities({
      ...activity,
      actionKind: "pending_action",
      actionId: "proposal",
      canRetry: true,
    }) as never,
  );
  api.approvePendingAction.mockRejectedValueOnce(
    new Error("La propuesta cambió"),
  );
  await mount();
  expect(
    screen.queryByRole("button", { name: "peopleActivity.actions.reject" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "peopleActivity.actions.retry" }),
  );
  fireEvent.click(screen.getByText("Confirmar propuesta"));
  expect(api.reauthenticate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Clave"), {
    target: { value: "password" },
  });
  fireEvent.click(screen.getByText("Confirmar propuesta"));
  await screen.findByText("La propuesta cambió");
  expect(api.approvePendingAction).toHaveBeenCalledWith("proposal", "reauth");
  fireEvent.click(screen.getByText("Confirmar propuesta"));
  await waitFor(() =>
    expect(screen.queryByLabelText("Revisión")).not.toBeInTheDocument(),
  );
});

it("links registration reviews to users and closes proposal reviews explicitly", async () => {
  api.getRecentActivity.mockResolvedValue({
    ...activities(),
    today: [
      {
        ...activity,
        id: "registration",
        subject: "Alta",
        actionKind: "registration",
      },
    ],
    new: [
      {
        ...activity,
        id: "proposal",
        subject: "Propuesta",
        actionKind: "pending_action",
        actionId: "proposal",
      },
    ],
  } as never);
  await mount();
  expect(
    screen.getByRole("link", { name: "peopleActivity.actions.review" }),
  ).toHaveAttribute("href", "/es/users");
  fireEvent.click(
    screen.getByRole("button", { name: "peopleActivity.actions.approve" }),
  );
  fireEvent.click(screen.getByText("Cerrar revisión"));
  expect(screen.queryByLabelText("Clave")).not.toBeInTheDocument();
});
