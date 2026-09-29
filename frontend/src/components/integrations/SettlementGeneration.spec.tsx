import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SettlementGenerationForm } from "./SettlementGenerationForm";
import { SettlementGenerationPanel } from "./SettlementGenerationPanel";
import {
  settlementGenerationsApi,
  type SettlementCalculationDto,
  type SettlementGenerationDto,
} from "@/lib/api/settlement-generations";
import { ApiRequestError } from "@/lib/api";
import { settlementNet } from "@/lib/settlement-generation";
jest.mock("@/lib/api/settlement-generations", () => ({
  settlementGenerationsApi: {
    overview: jest.fn(),
    preview: jest.fn(),
    generate: jest.fn(),
    void: jest.fn(),
    cancelRequest: jest.fn(),
  },
}));
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
const api = jest.mocked(settlementGenerationsApi);
const uuid = "10000000-0000-4000-8000-000000000001";
const key = "rent:settlement-generation:company:admin:owner";
const changed = jest.fn<Promise<void>, [string]>();
const calculation: SettlementCalculationDto = {
  ownerId: "owner",
  period: "2026-07",
  currency: "ARS",
  commissionRate: "5.25",
  grossAmount: "990.00",
  commissionAmount: "51.98",
  netBeforeWithholdings: "938.02",
  scheduledDate: "2026-07-12",
  existingSettlementIds: [],
  fingerprint: "a".repeat(64),
  invoices: [
    {
      id: "invoice",
      invoiceNumber: "INV-001",
      totalAmount: "1000.00",
      dueDate: "2026-07-10",
      collectedAmount: "1000.00",
      creditedAmount: "10.00",
      grossAmount: "990.00",
      scheduledDate: "2026-07-12",
      allocations: [
        {
          id: "allocation",
          paymentId: "payment",
          amount: "1000.00",
          paymentDate: "2026-07-12",
        },
      ],
      creditNotes: [{ id: "credit", amount: "10.00" }],
    },
  ],
};
const generation = (): SettlementGenerationDto => ({
  id: "generation",
  settlementId: "settlement",
  state: "active",
  requestedBy: "admin",
  createdAt: "2026-09-29T00:00:00Z",
  voidedBy: null,
  voidedAt: null,
  voidReason: null,
  snapshot: {
    calculation,
    additionalWithholdings: "0.00",
    withholdingReason: "Sin retenciones adicionales",
    netAmount: "938.02",
  },
});
const availability = {
  enabled: true,
  canVoid: false,
  requestCancelled: false,
  generation: null,
};
beforeEach(() => {
  jest.resetAllMocks();
  sessionStorage.clear();
  jest.spyOn(crypto, "randomUUID").mockReturnValue(uuid);
  changed.mockResolvedValue(undefined);
  api.overview.mockResolvedValue(availability);
  api.preview.mockResolvedValue(calculation);
  api.generate.mockImplementation(async (data) => ({
    ...generation(),
    snapshot: {
      calculation,
      additionalWithholdings: data.additionalWithholdings,
      withholdingReason: data.withholdingReason,
      netAmount: settlementNet(
        calculation.netBeforeWithholdings,
        data.additionalWithholdings,
      )!,
    },
  }));
  api.cancelRequest.mockResolvedValue({
    ...availability,
    requestCancelled: true,
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});
const form = () =>
  render(
    <SettlementGenerationForm
      ownerId="owner"
      scopeKey="company:admin"
      onChanged={changed}
    />,
  );
const loadPreview = async (expected = "invoices") => {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "preview" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("period"), {
    target: { value: "2026-07" },
  });
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  await screen.findByText(expected);
};
const confirm = () => {
  fireEvent.change(screen.getByLabelText("deductionReason"), {
    target: { value: "Sin retenciones adicionales" },
  });
  fireEvent.click(screen.getByLabelText("confirm"));
};
const panel = () => {
  api.overview.mockResolvedValue({
    ...availability,
    generation: generation(),
    canVoid: true,
  });
  return render(
    <SettlementGenerationPanel
      ownerId="owner"
      settlementId="settlement"
      onChanged={changed}
    />,
  );
};

it("keeps writes disabled while permitting an explicit local calculation preview", async () => {
  api.overview.mockResolvedValue({ ...availability, enabled: false });
  form();
  await screen.findByText("disabled");
  expect(api.preview).not.toHaveBeenCalled();
  await loadPreview();
  confirm();
  expect(screen.getByRole("button", { name: "generate" })).toBeDisabled();
  expect(api.generate).not.toHaveBeenCalled();
  expect(
    screen.getByRole("link", { name: "INV-001", hidden: true }),
  ).toHaveAttribute("href", "/es/invoices/invoice");
});

it("requires fresh confirmation after deductions change and sends the exact reviewed amount once", async () => {
  form();
  await loadPreview();
  confirm();
  expect(screen.getByRole("button", { name: "generate" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("deductions"), {
    target: { value: "38.02" },
  });
  expect(screen.getByLabelText("confirm")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "generate" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("confirm"));
  let finish!: (value: SettlementGenerationDto) => void;
  api.generate.mockImplementationOnce((data) => {
    expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({
      request: data,
      netAmount: "900.00",
    });
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const button = screen.getByRole("button", { name: "generate" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(api.generate).toHaveBeenCalledTimes(1);
  expect(api.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      confirmed: true,
      ownerId: "owner",
      period: "2026-07",
      currency: "ARS",
      expectedFingerprint: calculation.fingerprint,
      idempotencyKey: uuid,
      additionalWithholdings: "38.02",
    }),
  );
  await act(async () =>
    finish({
      ...generation(),
      snapshot: {
        ...generation().snapshot,
        additionalWithholdings: "38.02",
        netAmount: "900.00",
      },
    }),
  );
  await screen.findByText("generated");
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(changed).toHaveBeenCalledWith("settlement");
});

it.each(["-1.00", "1,00", "1.001", "938.02", "99999999999999.99"])(
  "rejects invalid or nonpositive net deductions %s",
  async (value) => {
    form();
    await loadPreview();
    confirm();
    fireEvent.change(screen.getByLabelText("deductions"), {
      target: { value },
    });
    fireEvent.click(screen.getByLabelText("confirm"));
    expect(screen.getByRole("button", { name: "generate" })).toBeDisabled();
    expect(api.generate).not.toHaveBeenCalled();
  },
);

it("invalidates a calculation when period or currency changes and rejects foreign preview results", async () => {
  form();
  await loadPreview();
  confirm();
  fireEvent.change(screen.getByLabelText("currency"), {
    target: { value: "usd" },
  });
  expect(
    screen.queryByRole("button", { name: "generate" }),
  ).not.toBeInTheDocument();
  api.preview.mockResolvedValue({
    ...calculation,
    currency: "USD",
    ownerId: "foreign",
  });
  fireEvent.click(screen.getByRole("button", { name: "preview" }));
  await screen.findByText("previewError");
  expect(screen.queryByText("invoices")).not.toBeInTheDocument();
});

it("persists an uncertain request across a remount and recovers by GET without sending again", async () => {
  api.generate.mockRejectedValueOnce(new Error("lost response"));
  const view = form();
  await loadPreview();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "generate" }));
  await screen.findByText("uncertain");
  expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(screen.queryByLabelText("period")).not.toBeInTheDocument();
  view.unmount();
  form();
  await screen.findByRole("button", { name: "retrySame" });
  expect(api.generate).toHaveBeenCalledTimes(1);
  api.overview.mockResolvedValue({ ...availability, generation: generation() });
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await screen.findByText("generated");
  expect(api.overview).toHaveBeenLastCalledWith("owner", { requestKey: uuid });
  expect(api.generate).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem(key)).toBeNull();
});

it("retries the same persisted request and retains uncertainty if that retry is rejected", async () => {
  api.generate
    .mockRejectedValueOnce(new Error("lost"))
    .mockRejectedValueOnce(new ApiRequestError(409, "changed"));
  form();
  await loadPreview();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "generate" }));
  await screen.findByText("uncertain");
  const saved = sessionStorage.getItem(key);
  fireEvent.click(screen.getByRole("button", { name: "retrySame" }));
  await screen.findByText("uncertain");
  expect(api.generate.mock.calls[1][0]).toEqual(api.generate.mock.calls[0][0]);
  expect(sessionStorage.getItem(key)).toBe(saved);
  fireEvent.click(screen.getByLabelText("confirmDiscard"));
  fireEvent.click(screen.getByRole("button", { name: "discard" }));
  await screen.findByText("discarded");
  expect(api.cancelRequest).toHaveBeenCalledWith("owner", uuid);
  expect(sessionStorage.getItem(key)).toBeNull();
});

it("recovers an existing record instead of voiding it when discarding an uncertain request", async () => {
  api.generate.mockRejectedValueOnce(new Error("lost"));
  api.cancelRequest.mockResolvedValue({
    ...availability,
    generation: generation(),
  });
  form();
  await loadPreview();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "generate" }));
  await screen.findByText("uncertain");
  fireEvent.click(screen.getByLabelText("confirmDiscard"));
  fireEvent.click(screen.getByRole("button", { name: "discard" }));
  await screen.findByText("generated");
  expect(api.void).not.toHaveBeenCalled();
});

it("clears a definitively rejected initial request and requires another preview", async () => {
  api.generate.mockRejectedValueOnce(new ApiRequestError(409, "stale"));
  form();
  await loadPreview();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "generate" }));
  await screen.findByText("generateError");
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(screen.getByLabelText("period")).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "generate" }),
  ).not.toBeInTheDocument();
});

it("blocks writes when pending storage is corrupted and does not reuse another scope", async () => {
  sessionStorage.setItem(key, '{"corrupted":true}');
  const view = form();
  await screen.findByText("storageError");
  await loadPreview();
  confirm();
  expect(screen.getByRole("button", { name: "generate" })).toBeDisabled();
  view.unmount();
  render(
    <SettlementGenerationForm
      ownerId="owner"
      scopeKey="another-company:admin"
      onChanged={changed}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "preview" })).toBeEnabled(),
  );
  expect(screen.queryByText("storageError")).not.toBeInTheDocument();
});

it("retains pending evidence when a response contains another owner or amount", async () => {
  api.generate.mockResolvedValue({
    ...generation(),
    snapshot: { ...generation().snapshot, netAmount: "999.99" },
  });
  form();
  await loadPreview();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "generate" }));
  await screen.findByText("uncertain");
  expect(changed).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(key)).not.toBeNull();
});

it("renders empty source and refresh failures without inventing a settlement", async () => {
  api.preview.mockResolvedValue({
    ...calculation,
    invoices: [],
    existingSettlementIds: ["old"],
  });
  form();
  await loadPreview("empty");
  await screen.findByText("empty");
  expect(screen.getByText("existing")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "generate" }),
  ).not.toBeInTheDocument();
  api.overview.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await screen.findByText("loadError");
});

it("requires reason and explicit confirmation to void and then refreshes the settlement list", async () => {
  panel();
  await screen.findByText("active");
  expect(screen.getByRole("button", { name: "void" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("voidReason"), {
    target: { value: "Corrección administrativa de facturas" },
  });
  fireEvent.click(screen.getByLabelText("confirmVoid"));
  fireEvent.change(screen.getByLabelText("voidReason"), {
    target: { value: "Corrección administrativa del período" },
  });
  expect(screen.getByLabelText("confirmVoid")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("confirmVoid"));
  api.void.mockResolvedValue({
    ...generation(),
    state: "voided",
    voidedAt: "2026-09-29T12:00:00Z",
    voidedBy: "admin",
    voidReason: "Corrección administrativa del período",
  });
  fireEvent.click(screen.getByRole("button", { name: "void" }));
  await screen.findByText("voided");
  expect(api.void).toHaveBeenCalledWith(
    "settlement",
    "Corrección administrativa del período",
  );
  expect(changed).toHaveBeenCalledWith("settlement");
});

it("blocks voiding disabled or ineligible records and keeps legacy read results distinct from failures", async () => {
  api.overview.mockResolvedValue({
    ...availability,
    enabled: false,
    generation: generation(),
    canVoid: true,
  });
  const view = render(
    <SettlementGenerationPanel
      ownerId="owner"
      settlementId="settlement"
      onChanged={changed}
    />,
  );
  await screen.findByText("disabled");
  expect(screen.getByRole("button", { name: "void" })).toBeDisabled();
  view.unmount();
  api.overview.mockResolvedValue(availability);
  render(
    <SettlementGenerationPanel
      ownerId="owner"
      settlementId="settlement"
      onChanged={changed}
    />,
  );
  await screen.findByText("legacy");
  expect(api.void).not.toHaveBeenCalled();
});

it("requires a read after a lost void response and never sends another mutation automatically", async () => {
  panel();
  await screen.findByText("active");
  fireEvent.change(screen.getByLabelText("voidReason"), {
    target: { value: "Corrección administrativa de facturas" },
  });
  fireEvent.click(screen.getByLabelText("confirmVoid"));
  api.void.mockRejectedValueOnce(new Error("lost"));
  fireEvent.click(screen.getByRole("button", { name: "void" }));
  await screen.findByText("auditError");
  expect(screen.getByRole("button", { name: "void" })).toBeDisabled();
  api.overview.mockResolvedValue({
    ...availability,
    generation: { ...generation(), state: "voided" },
  });
  fireEvent.click(screen.getByRole("button", { name: "refreshAudit" }));
  await screen.findByText("voided");
  expect(api.void).toHaveBeenCalledTimes(1);
});

it("does not expose an audit snapshot from another owner", async () => {
  api.overview.mockResolvedValue({
    ...availability,
    generation: {
      ...generation(),
      snapshot: {
        ...generation().snapshot,
        calculation: { ...calculation, ownerId: "foreign" },
      },
    },
  });
  render(
    <SettlementGenerationPanel
      ownerId="owner"
      settlementId="settlement"
      onChanged={changed}
    />,
  );
  await screen.findByText("auditError");
  expect(screen.queryByText("INV-001")).not.toBeInTheDocument();
});

it("preserves a pending request when the initial availability read fails", async () => {
  api.generate.mockRejectedValueOnce(new Error("lost"));
  const view = form();
  await loadPreview();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "generate" }));
  await screen.findByText("uncertain");
  const saved = sessionStorage.getItem(key);
  view.unmount();
  api.overview.mockRejectedValueOnce(new Error("offline"));
  form();
  await screen.findByText("loadError");
  expect(
    screen.queryByRole("button", { name: "preview" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "retrySame" })).toBeDisabled();
  expect(sessionStorage.getItem(key)).toBe(saved);
  api.overview.mockResolvedValue({ ...availability, generation: generation() });
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await screen.findByText("generated");
  expect(api.generate).toHaveBeenCalledTimes(1);
});

it("does not send a mutation when the tab cannot persist its key", async () => {
  form();
  await loadPreview();
  confirm();
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  fireEvent.click(screen.getByRole("button", { name: "generate" }));
  await screen.findByText("storageError");
  expect(api.generate).not.toHaveBeenCalled();
});

it("does not clear pending evidence or refresh another scope after unmount", async () => {
  let resolve!: (value: SettlementGenerationDto) => void;
  api.generate.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = form();
  await loadPreview();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "generate" }));
  view.unmount();
  await act(async () => resolve(generation()));
  expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(changed).not.toHaveBeenCalled();
});
