import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImportContactsPanel from "./ImportContactsPanel";
import MergeContactsPanel from "./MergeContactsPanel";
import PipelinePanel from "./PipelinePanel";
import { interestedWorkflowApi as api } from "@/lib/api/interested-workflow";
import { interestedApi } from "@/lib/api/interested";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { row?: number }) =>
    values?.row ? `${key} ${values.row}` : key,
}));
let admin = true;
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user", companyId: "company", role: admin ? "admin" : "staff" },
  }),
}));
jest.mock("@/lib/api/interested-workflow", () => ({
  interestedWorkflowApi: {
    previewImport: jest.fn(),
    applyImport: jest.fn(),
    previewMerge: jest.fn(),
    merge: jest.fn(),
    pipeline: jest.fn(),
    configurePipeline: jest.fn(),
    move: jest.fn(),
  },
}));
jest.mock("@/lib/api/interested", () => ({
  interestedApi: { getAll: jest.fn() },
}));
beforeEach(() => {
  jest.clearAllMocks();
  admin = true;
  jest.mocked(api.previewImport).mockResolvedValue({
    rows: [
      {
        index: 0,
        data: { phone: "123", firstName: "Ana", consentContact: false },
        duplicateIds: [],
        duplicateRows: [],
      },
      {
        index: 1,
        data: { phone: "456", firstName: "Duplicado", consentContact: true },
        duplicateIds: ["existing"],
        duplicateRows: [],
      },
    ],
    existing: [],
    reviewToken: "immutable-review",
  });
  jest.mocked(api.applyImport).mockResolvedValue({});
  jest.mocked(api.merge).mockResolvedValue({});
  jest.mocked(api.move).mockResolvedValue({});
  jest.mocked(api.configurePipeline).mockResolvedValue({});
  jest.mocked(api.pipeline).mockResolvedValue([
    { id: "new", label: "Nuevo" },
    { id: "visit", label: "Visita" },
  ]);
  jest.mocked(interestedApi.getAll).mockResolvedValue({
    data: [
      {
        id: "target",
        phone: "123",
        firstName: "Ana",
        createdAt: "2026-10-01",
        updatedAt: "2026-10-01",
      },
      {
        id: "source",
        phone: "456",
        firstName: "Maria",
        createdAt: "2026-10-01",
        updatedAt: "2026-10-01",
      },
    ],
    total: 2,
    page: 1,
    limit: 20,
  });
  jest.mocked(api.previewMerge).mockResolvedValue({
    people: [
      { id: "target", first_name: "Ana", phone: "123", consent_contact: true },
      {
        id: "source",
        first_name: "Maria",
        phone: "456",
        consent_contact: false,
      },
    ],
    impact: ["Conservar consentimiento destino"],
    related: { activities: [{}] },
    reviewToken: "immutable-merge",
  });
});
it("imports only after signed review and the explicit skip selection", async () => {
  render(<ImportContactsPanel />);
  fireEvent.change(screen.getByLabelText("csv"), {
    target: { value: "phone\n123\n456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  await screen.findByText("importReview");
  expect(api.applyImport).not.toHaveBeenCalled();
  expect(screen.getAllByLabelText("skipRow 2")[0]).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "confirmImport" }));
  await screen.findByText("importSuccess");
  expect(api.applyImport).toHaveBeenCalledWith({
    rows: [
      { phone: "123", firstName: "Ana", consentContact: false },
      { phone: "456", firstName: "Duplicado", consentContact: true },
    ],
    skipRows: [1],
    reviewToken: "immutable-review",
  });
});
it("shows import failures and preserves the uncertain reviewed payload", async () => {
  jest
    .mocked(api.applyImport)
    .mockRejectedValueOnce(new Error("response lost"));
  render(<ImportContactsPanel />);
  fireEvent.change(screen.getByLabelText("csv"), {
    target: { value: "phone\n123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  await screen.findByText("importReview");
  fireEvent.click(screen.getByRole("button", { name: "confirmImport" }));
  await screen.findByText("uncertain");
  expect(screen.getByLabelText("csv")).toBeDisabled();
  expect(api.applyImport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await screen.findByText("importSuccess");
  expect(api.applyImport).toHaveBeenLastCalledWith(
    jest.mocked(api.applyImport).mock.calls[0][0],
  );
});
it("rejects invalid CSV before any server preview", async () => {
  render(<ImportContactsPanel />);
  fireEvent.change(screen.getByLabelText("csv"), {
    target: { value: "name\nAna" },
  });
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  await screen.findByText("importError");
  expect(api.previewImport).not.toHaveBeenCalled();
});
it("shows both identities and consent before requiring merge acknowledgement", async () => {
  render(<MergeContactsPanel />);
  await screen.findAllByRole("option", { name: "Ana · 123" });
  fireEvent.change(screen.getByLabelText("target"), {
    target: { value: "target" },
  });
  fireEvent.change(screen.getByLabelText("source"), {
    target: { value: "source" },
  });
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  await screen.findByText("Conservar consentimiento destino");
  expect(api.merge).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "confirmMerge" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("mergeAcknowledgement"));
  fireEvent.click(screen.getByRole("button", { name: "confirmMerge" }));
  await screen.findByText("mergeSuccess");
  expect(api.merge).toHaveBeenCalledWith({
    targetId: "target",
    sourceId: "source",
    reviewToken: "immutable-merge",
  });
});
it("does not permit merging one profile into itself", async () => {
  render(<MergeContactsPanel />);
  await screen.findAllByRole("option", { name: "Ana · 123" });
  fireEvent.change(screen.getByLabelText("target"), {
    target: { value: "target" },
  });
  fireEvent.change(screen.getByLabelText("source"), {
    target: { value: "target" },
  });
  expect(screen.getByRole("button", { name: "preview" })).toBeDisabled();
});
it("requires a reviewed pipeline move and does not expose configuration to staff", async () => {
  admin = false;
  render(<PipelinePanel />);
  await screen.findByLabelText("stage");
  await screen.findByRole("option", { name: "Ana · 123" });
  expect(screen.queryByText("configure")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("person"), {
    target: { value: "target" },
  });
  fireEvent.change(screen.getByLabelText("stage"), {
    target: { value: "visit" },
  });
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  expect(api.move).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "confirmMove" }));
  await screen.findByText("moveSuccess");
  expect(api.move).toHaveBeenCalledWith({
    profileId: "target",
    stageId: "visit",
  });
});
it("shows pipeline read errors with explicit recovery", async () => {
  jest.mocked(api.pipeline).mockRejectedValueOnce(new Error("offline"));
  render(<PipelinePanel />);
  await screen.findByText("pipelineError");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByLabelText("stage");
  expect(api.pipeline).toHaveBeenCalledTimes(2);
});
it("validates and reviews administrative configuration before persisting", async () => {
  render(<PipelinePanel />);
  await screen.findByLabelText("stages");
  fireEvent.change(screen.getByLabelText("stages"), {
    target: { value: "new|Nuevo\nvisit|Visita\nwon|Concretado" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "preview" })[1]);
  expect(api.configurePipeline).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "confirmConfiguration" }));
  await waitFor(() =>
    expect(api.configurePipeline).toHaveBeenCalledWith({
      stages: [
        { id: "new", label: "Nuevo" },
        { id: "visit", label: "Visita" },
        { id: "won", label: "Concretado" },
      ],
    }),
  );
});
