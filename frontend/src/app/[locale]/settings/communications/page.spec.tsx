import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import CommunicationsSettingsPage from "./page";
import {
  communicationsApi,
  type CommunicationTemplate,
  type CommunicationDelivery,
} from "@/lib/api/communications";

const mockT = (
  key: string,
  values?: { variables?: string; status?: string },
) => {
  if (key === "missingVariables") return `Missing: ${values?.variables}`;
  if (key === "testRegistered") return `Registered: ${values?.status}`;
  return key;
};
jest.mock("next-intl", () => ({
  useTranslations: () => mockT,
  useLocale: () => "pt",
}));
jest.mock("@/lib/api/communications", () => ({
  communicationsApi: {
    listTemplates: jest.fn(),
    listDeliveries: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    preview: jest.fn(),
    sendTest: jest.fn(),
    retry: jest.fn(),
    approve: jest.fn(),
  },
}));
const template: CommunicationTemplate = {
  id: "template",
  name: "Existing template",
  event: "invoice_issued",
  recipientRole: "tenant",
  channel: "whatsapp",
  locale: "es",
  subject: "Invoice",
  body: "Hola {{nombre}}",
  isActive: true,
  autoSend: true,
  requiresApproval: false,
  variables: ["nombre"],
};
const delivery: CommunicationDelivery = {
  id: "failed",
  event: "invoice_issued",
  recipientRole: "tenant",
  channel: "whatsapp",
  recipient: "failed-recipient",
  body: "Invoice",
  status: "failed",
  attempts: 1,
  maxAttempts: 3,
  createdAt: "2026-10-02",
};
const api = jest.mocked(communicationsApi);
beforeEach(() => {
  jest.clearAllMocks();
  api.listTemplates.mockResolvedValue([template]);
  api.listDeliveries.mockResolvedValue([
    delivery,
    {
      ...delivery,
      id: "approval",
      recipient: "approval-recipient",
      status: "pending_approval",
    },
    { ...delivery, id: "sent", recipient: "sent-recipient", status: "sent" },
    {
      ...delivery,
      id: "blocked",
      recipient: "blocked-recipient",
      status: "blocked",
    },
  ]);
  api.createTemplate.mockResolvedValue({
    ...template,
    id: "created",
    name: "New template",
  });
  api.updateTemplate.mockResolvedValue(template);
  api.preview.mockResolvedValue({
    subject: "Preview subject",
    body: "Hello Ana",
    missingVariables: [],
  });
  api.sendTest.mockResolvedValue({ ...delivery, status: "queued" });
  api.retry.mockResolvedValue({ ...delivery, status: "queued" });
  api.approve.mockResolvedValue({ ...delivery, status: "queued" });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
async function loaded() {
  await screen.findByRole("heading", { name: "title" });
}
function submit() {
  fireEvent.submit(screen.getByLabelText("name").closest("form")!);
}
function action(recipient: string, name: string) {
  return within(screen.getByText(recipient).closest("tr")!).getByRole(
    "button",
    { name },
  );
}
it("loads translated template/history controls and offers only valid delivery actions", async () => {
  render(<CommunicationsSettingsPage />);
  await loaded();
  expect(api.listTemplates).toHaveBeenCalledTimes(1);
  expect(api.listDeliveries).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "back" })).toHaveAttribute(
    "href",
    "/pt/settings",
  );
  expect(screen.getByLabelText("language")).toHaveValue("pt");
  expect(screen.getByLabelText("body")).toHaveValue("defaultBody");
  expect(screen.getByText("statuses.sent")).toBeInTheDocument();
  expect(action("failed-recipient", "retry")).toBeEnabled();
  expect(action("approval-recipient", "approve")).toBeEnabled();
  expect(
    within(screen.getByText("sent-recipient").closest("tr")!).queryByRole(
      "button",
    ),
  ).not.toBeInTheDocument();
});
it("creates a complete template, extracts unique variables and retains user checkbox choices", async () => {
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.change(screen.getByLabelText("name"), {
    target: { value: "New template" },
  });
  fireEvent.change(screen.getByLabelText("event"), {
    target: { value: "property_visit_scheduled" },
  });
  fireEvent.change(screen.getByLabelText("role"), {
    target: { value: "interested" },
  });
  fireEvent.change(screen.getByLabelText("language"), {
    target: { value: "en" },
  });
  fireEvent.change(screen.getByLabelText("subject"), {
    target: { value: "Visit" },
  });
  fireEvent.change(screen.getByLabelText("body"), {
    target: {
      value:
        "Hello {{ nombre }} {{nombre}} {{property.id}} {{ invalid-variable }}",
    },
  });
  fireEvent.click(screen.getByLabelText("active"));
  fireEvent.click(screen.getByLabelText("autoSend"));
  fireEvent.click(screen.getByLabelText("requiresApproval"));
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent("saved");
  expect(api.createTemplate).toHaveBeenCalledWith({
    name: "New template",
    event: "property_visit_scheduled",
    recipientRole: "interested",
    channel: "whatsapp",
    locale: "en",
    subject: "Visit",
    body: "Hello {{ nombre }} {{nombre}} {{property.id}} {{ invalid-variable }}",
    isActive: false,
    autoSend: false,
    requiresApproval: true,
    variables: ["nombre", "property.id"],
  });
  expect(api.updateTemplate).not.toHaveBeenCalled();
  expect(api.listTemplates).toHaveBeenCalledTimes(2);
});
it("edits an existing template and resets to locale defaults without modifying the saved record", async () => {
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: /^Existing template/ }));
  expect(screen.getByLabelText("name")).toHaveValue("Existing template");
  fireEvent.change(screen.getByLabelText("body"), {
    target: { value: "Without variables" },
  });
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent("saved");
  expect(api.updateTemplate).toHaveBeenCalledWith(
    "template",
    expect.objectContaining({ body: "Without variables", variables: [] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "new" }));
  expect(screen.getByLabelText("name")).toHaveValue("");
  expect(screen.getByLabelText("language")).toHaveValue("pt");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("disables save and test actions during an outstanding save and preserves inputs on failure", async () => {
  let reject!: (error: Error) => void;
  api.createTemplate.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.change(screen.getByLabelText("name"), {
    target: { value: "Keep my template" },
  });
  submit();
  expect(screen.getByRole("button", { name: "saving" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "sendTest" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "preview" })).toBeDisabled();
  await act(async () => reject(new Error("Save denied")));
  expect(screen.getByRole("alert")).toHaveTextContent("saveError");
  expect(screen.getByLabelText("name")).toHaveValue("Keep my template");
  expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
});
it("previews rendered subject/body with missing variables and suppresses parallel action buttons", async () => {
  let finish!: (result: {
    subject: string | null;
    body: string;
    missingVariables: string[];
  }) => void;
  api.preview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  expect(screen.getByRole("button", { name: "preview" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  expect(api.preview).toHaveBeenCalledTimes(1);
  await act(async () =>
    finish({
      subject: "Preview subject",
      body: "Hello Ana",
      missingVariables: ["currency", "total"],
    }),
  );
  expect(screen.getByText(/Missing: currency, total/)).toHaveTextContent(
    "Preview subject Hello Ana Missing: currency, total",
  );
  fireEvent.click(screen.getByRole("button", { name: "new" }));
  expect(screen.queryByText(/Missing:/)).not.toBeInTheDocument();
});
it("handles subject-less previews and preview transport failures without losing message input", async () => {
  api.listTemplates.mockResolvedValue([{ ...template, subject: null }]);
  api.preview
    .mockResolvedValueOnce({
      subject: null,
      body: "Rendered body",
      missingVariables: [],
    })
    .mockRejectedValueOnce(new Error("Offline"));
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: /^Existing template/ }));
  expect(screen.getByLabelText("subject")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  await screen.findByText("Rendered body");
  expect(api.preview).toHaveBeenCalledWith(
    expect.objectContaining({ subject: undefined, body: "Hola {{nombre}}" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("previewError");
  expect(screen.getByLabelText("body")).toHaveValue("Hola {{nombre}}");
});
it("requires a test recipient and registers an explicit trimmed test without real providers", async () => {
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "sendTest" }));
  expect(screen.getByRole("alert")).toHaveTextContent("recipientRequired");
  expect(api.sendTest).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("testRecipient"), {
    target: { value: " +541112345678 " },
  });
  fireEvent.click(screen.getByRole("button", { name: "sendTest" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Registered: statuses.queued",
  );
  expect(api.sendTest).toHaveBeenCalledWith(
    expect.objectContaining({
      recipient: "+541112345678",
      channel: "whatsapp",
      body: "defaultBody",
      variables: expect.objectContaining({ nombre: "Cliente de prueba" }),
    }),
  );
  expect(api.listDeliveries).toHaveBeenCalledTimes(2);
});
it("reports send test failure and reenables controls for explicit recovery", async () => {
  api.sendTest.mockRejectedValueOnce(new Error("Unavailable"));
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.change(screen.getByLabelText("testRecipient"), {
    target: { value: "+5411" },
  });
  fireEvent.click(screen.getByRole("button", { name: "sendTest" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("sendError");
  expect(screen.getByRole("button", { name: "sendTest" })).toBeEnabled();
  expect(screen.getByLabelText("testRecipient")).toHaveValue("+5411");
});
it("retries failed deliveries and approves pending ones without offering actions for sent messages", async () => {
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.click(action("failed-recipient", "retry"));
  await waitFor(() => expect(api.listDeliveries).toHaveBeenCalledTimes(2));
  expect(api.retry).toHaveBeenCalledWith("failed");
  expect(api.approve).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(action("approval-recipient", "approve")).toBeEnabled(),
  );
  fireEvent.click(action("approval-recipient", "approve"));
  await waitFor(() => expect(api.listDeliveries).toHaveBeenCalledTimes(3));
  expect(api.approve).toHaveBeenCalledWith("approval");
});
it("keeps a failed delivery visible and exposes action failure instead of claiming it was sent", async () => {
  api.retry.mockRejectedValueOnce(new Error("Blocked"));
  render(<CommunicationsSettingsPage />);
  await loaded();
  fireEvent.click(action("failed-recipient", "retry"));
  expect(await screen.findByRole("alert")).toHaveTextContent("actionError");
  expect(screen.getByText("statuses.failed")).toBeInTheDocument();
  expect(api.listDeliveries).toHaveBeenCalledTimes(1);
});
it("distinguishes initial and refresh read errors and clears the notice after successful explicit retry", async () => {
  api.listTemplates.mockRejectedValueOnce(new Error("Offline"));
  render(<CommunicationsSettingsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("loadError");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  api.listDeliveries.mockRejectedValueOnce(new Error("Offline"));
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("loadError");
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});
