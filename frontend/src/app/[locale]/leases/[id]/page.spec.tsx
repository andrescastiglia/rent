import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LeaseDetailPage from "./page";
import { leasesApi } from "@/lib/api/leases";
import { ownersApi } from "@/lib/api/owners";
import { paymentsApi, tenantAccountsApi } from "@/lib/api/payments";
const mockRouter = { push: jest.fn() };
let mockRole = "admin";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({ useParams: () => ({ id: "lease" }) }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => mockRouter,
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "user", companyId: "company", role: mockRole },
  }),
}));
jest.mock("@/lib/api/leases", () => ({
  leasesApi: {
    getById: jest.fn(),
    delete: jest.fn(),
    renderDraft: jest.fn(),
    updateDraftText: jest.fn(),
    confirmDraft: jest.fn(),
  },
}));
jest.mock("@/lib/api/owners", () => ({ ownersApi: { getById: jest.fn() } }));
jest.mock("@/lib/api/payments", () => ({
  paymentsApi: { getAll: jest.fn() },
  tenantAccountsApi: { getByLease: jest.fn(), getBalance: jest.fn() },
}));
jest.mock("@/components/leases/LeaseAmendments", () => ({
  LeaseAmendments: () => <section>Amendments</section>,
}));
jest.mock("@/components/leases/ContractDocument", () => ({
  ContractDocument: () => <section>Contract PDF</section>,
}));
jest.mock("@/components/leases/BfaStamps", () => ({
  BfaStamps: () => <section>BFA</section>,
}));
const api = jest.mocked(leasesApi),
  owners = jest.mocked(ownersApi),
  accounts = jest.mocked(tenantAccountsApi),
  payments = jest.mocked(paymentsApi);
const lease = {
  id: "lease",
  ownerId: "owner",
  status: "DRAFT",
  contractType: "rental",
  currency: "ARS",
  rentAmount: 500000.35,
  depositAmount: 500000.35,
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2026-10-31T00:00:00.000Z",
  property: {
    name: "Casa",
    address: { street: "Belgrano", number: "20", city: "Córdoba" },
  },
  tenant: {
    firstName: "Ana",
    lastName: "Pérez",
    email: "persona@example.invalid",
  },
  templateId: "template",
  draftContractText:
    '<p>Canon <strong>ARS 500000.35</strong></p><img src="x" onerror="alert(1)">',
  draftContractFormat: "html",
  documents: [],
  versionNumber: 1,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = "admin";
  api.getById.mockResolvedValue(lease as never);
  api.updateDraftText.mockResolvedValue(lease as never);
  api.renderDraft.mockResolvedValue(lease as never);
  api.confirmDraft.mockResolvedValue({
    ...lease,
    status: "ACTIVE",
    confirmedContractText: "Texto confirmado",
  } as never);
  owners.getById.mockResolvedValue({
    id: "owner",
    firstName: "María",
    lastName: "Propietaria",
  } as never);
  payments.getAll.mockResolvedValue({
    data: [
      {
        id: "payment",
        amount: 1000.25,
        currencyCode: "ARS",
        paymentDate: "2026-10-01T00:00:00.000Z",
        reference: "Cobro A",
      },
    ],
  } as never);
  accounts.getByLease.mockResolvedValue({ id: "account" } as never);
  accounts.getBalance.mockResolvedValue({
    balance: 497999.5,
    lateFee: 0,
    total: 497999.5,
  } as never);
});
it("names the rich editor as a keyboard accessible multiline textbox and preserves safe HTML", async () => {
  render(<LeaseDetailPage />);
  const editor = await screen.findByRole("textbox", { name: "draftText" });
  expect(editor).toHaveAttribute("contenteditable", "true");
  expect(editor).toHaveAttribute("aria-multiline", "true");
  expect(editor).toHaveAttribute("tabindex", "0");
  editor.focus();
  expect(editor).toHaveFocus();
  await waitFor(() =>
    expect(editor.querySelector("strong")).toHaveTextContent("ARS 500000.35"),
  );
  expect(editor.querySelector("[onerror]")).toBeNull();
  editor.innerHTML = "<p>Canon <strong>ARS 450000.50</strong></p>";
  fireEvent.input(editor);
  fireEvent.click(screen.getByRole("button", { name: "draft.saveDraft" }));
  await waitFor(() =>
    expect(api.updateDraftText).toHaveBeenCalledWith(
      "lease",
      "<p>Canon <strong>ARS 450000.50</strong></p>",
      "html",
    ),
  );
});
it("preserves calendar dates and real balances including cents", async () => {
  render(<LeaseDetailPage />);
  await screen.findByRole("heading", { name: "leaseAgreement" });
  await waitFor(() =>
    expect(screen.getAllByText(/497\.999,50/).length).toBeGreaterThan(0),
  );
  expect(
    screen.getByText("detail.dateRange:1/8/2026|31/10/2026"),
  ).toBeInTheDocument();
  expect(screen.getByText("detail.lastPayment:1/10/2026")).toBeInTheDocument();
});
it("distinguishes failed contract reads from not found and recovers explicitly", async () => {
  api.getById.mockRejectedValueOnce(new Error("offline"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  render(<LeaseDetailPage />);
  await screen.findByRole("heading", { name: "detail.loadError" });
  expect(api.getById).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByRole("heading", { name: "leaseAgreement" });
  expect(api.getById).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});
it("reports unavailable collections without inventing an empty account and recovers with a read retry", async () => {
  payments.getAll.mockRejectedValueOnce(new Error("offline"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  render(<LeaseDetailPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "detail.collectionsError",
  );
  expect(screen.queryByText(/497\.999,50/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await waitFor(() =>
    expect(screen.getAllByText(/497\.999,50/).length).toBeGreaterThan(0),
  );
  spy.mockRestore();
});
it("keeps a confirmed contract read only for tenants", async () => {
  mockRole = "tenant";
  api.getById.mockResolvedValue({
    ...lease,
    status: "ACTIVE",
    confirmedContractFormat: "plain_text",
    confirmedContractText: "Contrato vigente",
  } as never);
  render(<LeaseDetailPage />);
  await screen.findByText("Contrato vigente");
  expect(
    screen.queryByRole("textbox", { name: "draftText" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "delete" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "detail.registerPayment" }),
  ).not.toBeInTheDocument();
});
