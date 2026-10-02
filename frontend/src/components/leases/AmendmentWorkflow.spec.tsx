import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AmendmentWorkflow } from "./AmendmentWorkflow";
import { amendmentsApi, type LeaseAmendment } from "@/lib/api/amendments";
import { ApiRequestError } from "@/lib/api";
import {
  prepareAmendmentAttempt,
  completeAmendmentAttempt,
} from "@/lib/amendment-workflow";
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/lib/api/amendments", () => ({
  amendmentsApi: { create: jest.fn(), transition: jest.fn() },
}));
jest.mock("@/lib/amendment-workflow", () => ({
  ...jest.requireActual("@/lib/amendment-workflow"),
  prepareAmendmentAttempt: jest.fn(),
  completeAmendmentAttempt: jest.fn(),
}));
const api = jest.mocked(amendmentsApi);
const prepare = jest.mocked(prepareAmendmentAttempt);
const complete = jest.mocked(completeAmendmentAttempt);
const scope = { companyId: "company", userId: "user", leaseId: "lease" };
const onCompleted = jest.fn(),
  onLockChange = jest.fn();
const item = {
  id: "amendment",
  status: "pending_approval",
  amendmentNumber: 1,
  description: "Change",
  effectiveDate: "2026-10-01",
  updatedAt: "2026-09-29T12:00:00.000Z",
} as LeaseAmendment;
function mount(props = {}) {
  return render(
    <AmendmentWorkflow
      scope={scope}
      items={[item]}
      active
      rental
      currency="ARS"
      disabled={false}
      onCompleted={onCompleted}
      onLockChange={onLockChange}
      {...props}
    />,
  );
}
function field(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
function draft() {
  fireEvent.click(screen.getByRole("button", { name: "newDraft" }));
  field("effectiveDate", "2026-10-01");
  field("draftDetails", "Rent change");
  field("fields.monthlyRent (ARS)", "1200");
}
function confirm() {
  fireEvent.click(screen.getByRole("checkbox", { name: "confirm" }));
}
beforeEach(() => {
  jest.resetAllMocks();
  prepare.mockResolvedValue({
    storageKey: "stored",
    idempotencyKey: "stable-key",
  });
  onCompleted.mockResolvedValue(undefined);
  api.create.mockResolvedValue(item);
  api.transition.mockResolvedValue(item);
});
it("creates a confirmed draft and refreshes the contract after completion", async () => {
  mount();
  draft();
  expect(screen.getByRole("button", { name: "saveDraft" })).toBeDisabled();
  confirm();
  field("draftDetails", "Revised rent change");
  expect(screen.getByRole("button", { name: "saveDraft" })).toBeDisabled();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "saveDraft" }));
  await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  expect(api.create).toHaveBeenCalledWith({
    companyId: "company",
    leaseId: "lease",
    changeType: "rent_increase",
    effectiveDate: "2026-10-01",
    description: "Revised rent change",
    newValues: { monthlyRent: "1200.00" },
    idempotencyKey: "stable-key",
  });
  expect(complete).toHaveBeenCalledTimes(1);
  expect(onLockChange).toHaveBeenLastCalledWith(false);
});
it.each([
  ["submit", "draft", "sendForApproval"],
  ["approve", "pending_approval", "approve"],
  ["reject", "pending_approval", "reject"],
])(
  "confirms %s against the observed version",
  async (action, status, label) => {
    mount({ items: [{ ...item, status }] });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByText(`decision.${action}`)).toBeInTheDocument();
    confirm();
    fireEvent.click(screen.getByRole("button", { name: "confirmDecision" }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(api.transition).toHaveBeenCalledWith("amendment", action, {
      idempotencyKey: "stable-key",
      expectedUpdatedAt: item.updatedAt,
    });
  },
);
it("freezes uncertain creation and recovers the identical payload", async () => {
  api.create.mockRejectedValueOnce(new Error("response lost"));
  mount();
  draft();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "saveDraft" }));
  await screen.findByText("uncertain");
  expect(screen.getByLabelText("draftDetails")).toBeDisabled();
  expect(screen.getByRole("button", { name: "back" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  expect(api.create.mock.calls[1]).toEqual(api.create.mock.calls[0]);
  expect(prepare).toHaveBeenCalledTimes(1);
});
it("does not send if durable recovery storage fails", async () => {
  prepare.mockRejectedValue(new Error("quota"));
  mount();
  draft();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "saveDraft" }));
  await screen.findByText("storageError");
  expect(api.create).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});
it("preserves the durable key on a definite rejection", async () => {
  api.transition.mockRejectedValue(new ApiRequestError(409, "changed"));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "approve" }));
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "confirmDecision" }));
  await screen.findByText("rejected");
  expect(complete).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "recover" }),
  ).not.toBeInTheDocument();
});
it("keeps successful mutations complete when the subsequent refresh fails", async () => {
  onCompleted.mockRejectedValue(new Error("offline"));
  mount();
  draft();
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "saveDraft" }));
  await screen.findByText("completedReadError");
  expect(complete).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "recover" }),
  ).not.toBeInTheDocument();
});
it("prevents double sends and retains recovery when the component unmounts", async () => {
  let resolve!: (value: LeaseAmendment) => void;
  api.create.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { unmount } = mount();
  draft();
  confirm();
  const button = screen.getByRole("button", { name: "saveDraft" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
  unmount();
  await act(async () => resolve(item));
  expect(complete).not.toHaveBeenCalled();
  expect(onCompleted).not.toHaveBeenCalled();
});
it("allows rejection but not creation or approval on an inactive contract", () => {
  mount({ active: false });
  expect(
    screen.queryByRole("button", { name: "newDraft" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "approve" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "reject" })).toBeEnabled();
});
it("excludes rent changes for a sale and submits only the selected clauses", async () => {
  mount({ rental: false });
  fireEvent.click(screen.getByRole("button", { name: "newDraft" }));
  expect(
    screen.queryByRole("option", { name: "type.rent_increase" }),
  ).not.toBeInTheDocument();
  field("effectiveDate", "2026-10-01");
  field("draftDetails", "Updated terms");
  field("fields.termsAndConditions", "New terms");
  field("fields.specialClauses", "New clauses");
  confirm();
  fireEvent.click(screen.getByRole("button", { name: "saveDraft" }));
  await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  expect(api.create.mock.calls[0][0].newValues).toEqual({
    termsAndConditions: "New terms",
    specialClauses: "New clauses",
  });
});
it.each(["extension", "early_termination", "guarantor_change", "other"])(
  "renders and validates %s fields",
  async (changeType) => {
    mount();
    draft();
    field("changeType", changeType);
    if (changeType === "extension") field("fields.endDate", "2027-10-01");
    if (["guarantor_change", "other"].includes(changeType))
      field("fields.specialClauses", "Full replacement");
    confirm();
    fireEvent.click(screen.getByRole("button", { name: "saveDraft" }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0].newValues).not.toHaveProperty(
      "monthlyRent",
    );
  },
);
it("cancels without writing and respects an externally disabled workflow", () => {
  const { rerender } = mount();
  fireEvent.click(screen.getByRole("button", { name: "newDraft" }));
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  expect(onLockChange).toHaveBeenLastCalledWith(false);
  expect(api.create).not.toHaveBeenCalled();
  rerender(
    <AmendmentWorkflow
      scope={scope}
      items={[item]}
      active
      rental
      currency="ARS"
      disabled
      onCompleted={onCompleted}
      onLockChange={onLockChange}
    />,
  );
  expect(screen.getByRole("button", { name: "newDraft" })).toBeDisabled();
});
