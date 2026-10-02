import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import FinancialSettingsPanel from "./FinancialSettingsPanel";
import { companySettingsApi } from "@/lib/api/company-settings";
import { recoverDomainRequest } from "@/lib/domain-request";
import { ApiRequestError } from "@/lib/api";
let mockSettingsUser: { id?: string; companyId?: string } | null = {
  id: "admin",
  companyId: "company",
};
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockSettingsUser }),
}));
jest.mock("@/lib/api/company-settings", () => ({
  companySettingsApi: { getFinancial: jest.fn(), updateFinancial: jest.fn() },
}));
jest.mock("@/lib/domain-request", () => ({ recoverDomainRequest: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  mockSettingsUser = { id: "admin", companyId: "company" };
  jest.mocked(companySettingsApi.getFinancial).mockResolvedValue({
    configured: true,
    commissionTaxRate: 21,
    source: "Audit source",
    effectiveFrom: "2026-10-01",
  });
  jest
    .mocked(recoverDomainRequest)
    .mockImplementation(async (_path, _method, _body, execute) =>
      execute("same-key"),
    );
  jest.mocked(companySettingsApi.updateFinancial).mockResolvedValue({
    configured: true,
    commissionTaxRate: 10,
    source: "Audit source",
    effectiveFrom: "2026-10-01",
  });
});
it("displays the audited tax source and persists explicit changed parameters", async () => {
  render(<FinancialSettingsPanel />);
  await screen.findByLabelText("rate");
  expect(screen.getByLabelText("source")).toHaveValue("Audit source");
  expect(screen.getByLabelText("date")).toHaveValue("2026-10-01");
  fireEvent.change(screen.getByLabelText("rate"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("success");
  expect(companySettingsApi.updateFinancial).toHaveBeenCalledWith(
    {
      commissionTaxRate: 10,
      source: "Audit source",
      effectiveFrom: "2026-10-01",
    },
    "same-key",
  );
});
it("shows a failed read and permits an explicit query retry", async () => {
  jest
    .mocked(companySettingsApi.getFinancial)
    .mockRejectedValueOnce(new Error("offline"));
  render(<FinancialSettingsPanel />);
  await screen.findByText("error");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await waitFor(() => expect(screen.getByLabelText("rate")).toHaveValue(21));
  expect(companySettingsApi.getFinancial).toHaveBeenCalledTimes(2);
});
it("freezes a lost response and recovers the same request without an automatic update", async () => {
  jest
    .mocked(recoverDomainRequest)
    .mockRejectedValueOnce(new Error("response lost"));
  render(<FinancialSettingsPanel />);
  await screen.findByLabelText("rate");
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("uncertain");
  expect(screen.getByLabelText("rate")).toBeDisabled();
  expect(screen.getByLabelText("source")).toBeDisabled();
  expect(recoverDomainRequest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await screen.findByText("success");
  expect(jest.mocked(recoverDomainRequest).mock.calls[0].slice(0, 3)).toEqual(
    jest.mocked(recoverDomainRequest).mock.calls[1].slice(0, 3),
  );
});

it("leaves an unconfigured company blank instead of inventing a tax rate or source", async () => {
  jest.mocked(companySettingsApi.getFinancial).mockResolvedValue({
    configured: false,
    commissionTaxRate: null,
    source: null,
    effectiveFrom: null,
  });
  render(<FinancialSettingsPanel />);
  await screen.findByLabelText("rate");
  expect(screen.getByLabelText("rate")).toHaveValue(null);
  expect(screen.getByLabelText("source")).toHaveValue("");
  expect(screen.getByLabelText("date")).toHaveValue("");
  expect(companySettingsApi.updateFinancial).not.toHaveBeenCalled();
});
it("saves an explicit zero tax rate, changed effective date and trimmed evidence source", async () => {
  render(<FinancialSettingsPanel />);
  await screen.findByLabelText("rate");
  fireEvent.change(screen.getByLabelText("rate"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("source"), {
    target: { value: "  Explicit audited source  " },
  });
  fireEvent.change(screen.getByLabelText("date"), {
    target: { value: "2026-09-30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("success");
  expect(companySettingsApi.updateFinancial).toHaveBeenCalledWith(
    {
      commissionTaxRate: 0,
      source: "Explicit audited source",
      effectiveFrom: "2026-09-30",
    },
    "same-key",
  );
});
it.each([null, { id: "admin" }, { companyId: "company" }])(
  "does not submit without an authenticated company and actor",
  async (user) => {
    mockSettingsUser = user;
    render(<FinancialSettingsPanel />);
    await screen.findByLabelText("rate");
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(recoverDomainRequest).not.toHaveBeenCalled();
    expect(companySettingsApi.updateFinancial).not.toHaveBeenCalled();
  },
);
it("keeps all financial fields locked until the persistence response resolves", async () => {
  let resolve: (value: unknown) => void = () => undefined;
  jest.mocked(recoverDomainRequest).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<FinancialSettingsPanel />);
  await screen.findByLabelText("rate");
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await waitFor(() => expect(screen.getByLabelText("rate")).toBeDisabled());
  expect(screen.getByLabelText("source")).toBeDisabled();
  expect(screen.getByLabelText("date")).toBeDisabled();
  await act(async () => resolve(undefined));
  await screen.findByText("success");
  expect(screen.getByLabelText("rate")).toBeEnabled();
});
it("allows correction after a definite rejection without offering recovery", async () => {
  jest
    .mocked(recoverDomainRequest)
    .mockRejectedValue(new ApiRequestError(422, "Invalid fiscal source"));
  render(<FinancialSettingsPanel />);
  await screen.findByLabelText("rate");
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("rejected");
  expect(screen.getByLabelText("rate")).toBeEnabled();
  expect(screen.queryByRole("button", { name: "recover" })).toBeNull();
});
it("ignores a read resolved after the panel is unmounted", async () => {
  let resolve: (value: unknown) => void = () => undefined;
  jest.mocked(companySettingsApi.getFinancial).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done as (value: unknown) => void;
      }),
  );
  const { unmount, container } = render(<FinancialSettingsPanel />);
  expect(screen.getByText("loading")).toBeInTheDocument();
  unmount();
  await act(async () =>
    resolve({
      configured: true,
      commissionTaxRate: 21,
      source: "Audit source",
      effectiveFrom: "2026-10-01",
    }),
  );
  expect(container).toBeEmptyDOMElement();
  expect(companySettingsApi.updateFinancial).not.toHaveBeenCalled();
});
