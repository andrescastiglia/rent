import { communicationsApi } from "./communications";
import { interestedWorkflowApi } from "./interested-workflow";
import { companySettingsApi } from "./company-settings";
import { apiClient } from "../api";
import { getToken } from "../auth";
jest.mock("../api", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../auth", () => ({ getToken: jest.fn() }));
const client = jest.mocked(apiClient);
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getToken).mockReturnValue("session");
  client.get.mockResolvedValue([]);
  client.post.mockResolvedValue({});
  client.patch.mockResolvedValue({});
});
it("retains consent review and selections through CRM import and merge", async () => {
  const rows = [{ phone: "+5491112345678", consentContact: false }];
  const importReview = { rows: [], existing: [], reviewToken: "signed" };
  client.post.mockResolvedValueOnce(importReview);
  expect(await interestedWorkflowApi.previewImport(rows)).toBe(importReview);
  await interestedWorkflowApi.applyImport({
    rows,
    reviewToken: "signed",
    skipRows: [1],
  });
  const merge = { targetId: "target", sourceId: "source" };
  await interestedWorkflowApi.previewMerge(merge);
  await interestedWorkflowApi.merge({ ...merge, reviewToken: "signed-merge" });
  expect(client.post.mock.calls).toEqual([
    ["/interested/workflow/import/preview", { rows }, "session"],
    [
      "/interested/workflow/import",
      { rows, reviewToken: "signed", skipRows: [1] },
      "session",
    ],
    ["/interested/workflow/merge/preview", merge, "session"],
    [
      "/interested/workflow/merge",
      { ...merge, reviewToken: "signed-merge" },
      "session",
    ],
  ]);
});
it("preserves configured stages and changes only the selected person", async () => {
  jest.mocked(getToken).mockReturnValue(null);
  const stages = [{ id: "new", label: "Nuevo" }];
  client.get.mockResolvedValueOnce(stages);
  expect(await interestedWorkflowApi.pipeline()).toBe(stages);
  await interestedWorkflowApi.configurePipeline({ stages });
  await interestedWorkflowApi.move({ profileId: "person", stageId: "new" });
  expect(client.get).toHaveBeenCalledWith(
    "/interested/workflow/pipeline",
    undefined,
  );
  expect(client.patch.mock.calls).toEqual([
    ["/interested/workflow/pipeline", { stages }, undefined],
    ["/interested/workflow/pipeline/person", { stageId: "new" }, undefined],
  ]);
});
it("keeps the reviewed financial parameters and request key unchanged", async () => {
  const settings = {
    configured: true,
    commissionTaxRate: 21,
    source: "Acta",
    effectiveFrom: "2026-10-01",
  };
  client.get.mockResolvedValue(settings);
  client.patch.mockResolvedValue(settings);
  expect(await companySettingsApi.getFinancial()).toEqual(settings);
  const { configured: _configured, ...input } = settings;
  expect(await companySettingsApi.updateFinancial(input, "same-key")).toEqual(
    settings,
  );
  expect(client.patch).toHaveBeenCalledWith(
    "/companies/current/financial-settings",
    input,
    "session",
    { "Idempotency-Key": "same-key" },
  );
  jest.mocked(getToken).mockReturnValue(null);
  await companySettingsApi.updateFinancial(input, "same-key");
  expect(client.patch).toHaveBeenLastCalledWith(
    "/companies/current/financial-settings",
    input,
    undefined,
    { "Idempotency-Key": "same-key" },
  );
});
it("passes communication templates, preview variables and explicit approval without automatic sends", async () => {
  const input = {
    name: "Visita",
    event: "property_visit_scheduled" as const,
    recipientRole: "owner" as const,
    channel: "whatsapp" as const,
    locale: "es",
    body: "{{name}}",
    isActive: true,
    autoSend: false,
    requiresApproval: true,
    variables: ["name"],
  };
  await communicationsApi.listTemplates();
  await communicationsApi.createTemplate(input);
  await communicationsApi.updateTemplate("template", { autoSend: false });
  const preview = {
    templateId: "template",
    variables: { name: "Ana", total: 1, optedIn: false, missing: null },
  };
  await communicationsApi.preview(preview);
  await communicationsApi.sendTest({
    ...preview,
    channel: "whatsapp",
    recipient: "+54911",
  });
  await communicationsApi.listDeliveries();
  await communicationsApi.approve("delivery");
  await communicationsApi.retry("delivery");
  expect(client.get.mock.calls).toEqual([
    ["/communications/templates", "session"],
    ["/communications/deliveries", "session"],
  ]);
  expect(client.post).toHaveBeenCalledWith(
    "/communications/templates",
    input,
    "session",
  );
  expect(client.post).toHaveBeenCalledWith(
    "/communications/preview",
    preview,
    "session",
  );
  expect(client.post).toHaveBeenCalledWith(
    "/communications/test",
    { ...preview, channel: "whatsapp", recipient: "+54911" },
    "session",
  );
  expect(client.post).toHaveBeenCalledWith(
    "/communications/deliveries/delivery/approve",
    {},
    "session",
  );
  expect(client.post).toHaveBeenCalledWith(
    "/communications/deliveries/delivery/retry",
    {},
    "session",
  );
  jest.mocked(getToken).mockReturnValue(null);
  await communicationsApi.listTemplates();
  expect(client.get).toHaveBeenLastCalledWith(
    "/communications/templates",
    undefined,
  );
});
it("propagates CRM and financial failure so callers cannot display false success", async () => {
  const failure = new Error("conflict");
  client.post.mockRejectedValue(failure);
  client.patch.mockRejectedValue(failure);
  await expect(
    interestedWorkflowApi.merge({
      targetId: "t",
      sourceId: "s",
      reviewToken: "old",
    }),
  ).rejects.toBe(failure);
  await expect(
    companySettingsApi.updateFinancial(
      { commissionTaxRate: 21, source: "Acta", effectiveFrom: "2026-10-01" },
      "key",
    ),
  ).rejects.toBe(failure);
});
