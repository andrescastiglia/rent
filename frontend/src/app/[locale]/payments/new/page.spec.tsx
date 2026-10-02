import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import NewPaymentPage from "./page";
import { paymentsApi, tenantAccountsApi } from "@/lib/api/payments";
import { leasesApi } from "@/lib/api/leases";
import { ApiRequestError } from "@/lib/api";
import type { Lease } from "@/types/lease";
import type { User } from "@/types/auth";
import type { TenantAccount } from "@/types/payment";

const mockAuth: { user: User | null; loading: boolean } = {
  user: null,
  loading: false,
};
const mockPush = jest.fn();
let mockLeaseId = "";
const mockT = (key: string) => key;
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: () => mockLeaseId }),
}));
jest.mock("next-intl", () => ({
  useTranslations: () => mockT,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => mockAuth }));
jest.mock("@/lib/api/payments", () => ({
  paymentsApi: { create: jest.fn() },
  tenantAccountsApi: { getByLease: jest.fn(), getBalance: jest.fn() },
}));
jest.mock("@/lib/api/leases", () => ({ leasesApi: { getAll: jest.fn() } }));
jest.mock("@/components/common/CurrencySelect", () => ({
  CurrencySelect: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="ARS">ARS</option>
      <option value="USD">USD</option>
    </select>
  ),
}));
const lease = {
  id: "lease",
  propertyId: "property",
  status: "ACTIVE",
  currency: "USD",
  property: { name: "Casa Central" },
  tenant: { firstName: "Ana", lastName: "Tenant" },
} as Lease;
const account: TenantAccount = {
  id: "account",
  leaseId: "lease",
  balance: 100,
  lastMovementAt: null,
  createdAt: "",
  updatedAt: "",
};
const accounts = jest.mocked(tenantAccountsApi),
  payments = jest.mocked(paymentsApi);
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.loading = false;
  mockAuth.user = {
    id: "admin",
    companyId: "company",
    role: "admin",
    email: null,
    firstName: "Admin",
    lastName: "User",
  };
  mockLeaseId = "";
  jest
    .mocked(leasesApi.getAll)
    .mockResolvedValue([lease, { ...lease, id: "draft", status: "DRAFT" }]);
  accounts.getByLease.mockResolvedValue(account);
  accounts.getBalance.mockResolvedValue({
    balance: 100,
    lateFee: 20,
    total: 120,
  });
  payments.create.mockResolvedValue({ id: "payment" } as never);
});
async function chooseLease() {
  const selector = await screen.findByLabelText("selectLease");
  fireEvent.change(selector, { target: { value: "lease" } });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "savePayment" })).toBeEnabled(),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("amount *")).toHaveValue(100),
  );
}
function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: "savePayment" }).closest("form")!,
  );
}
it("waits for authentication and blocks external roles or staff lacking payment permission", () => {
  mockAuth.loading = true;
  const view = render(<NewPaymentPage />);
  expect(screen.getByText("review")).toBeInTheDocument();
  expect(leasesApi.getAll).not.toHaveBeenCalled();
  mockAuth.loading = false;
  for (const role of ["owner", "buyer", "tenant", "staff"] as const) {
    mockAuth.user = { ...mockAuth.user!, role };
    view.rerender(<NewPaymentPage />);
    expect(screen.getByText("unavailable")).toBeInTheDocument();
  }
  mockAuth.user = null;
  view.rerender(<NewPaymentPage />);
  expect(leasesApi.getAll).not.toHaveBeenCalled();
});
it("preselects active contracts, excludes drafts and defaults to principal without optional late fees", async () => {
  mockLeaseId = "lease";
  render(<NewPaymentPage />);
  await waitFor(() =>
    expect(screen.getByLabelText("amount *")).toHaveValue(100),
  );
  expect(screen.getByLabelText("selectLease")).toHaveValue("lease");
  expect(
    screen
      .getAllByRole("option")
      .some((option) => option.getAttribute("value") === "draft"),
  ).toBe(false);
  expect(screen.getByLabelText("title *")).toHaveValue("USD");
  expect(screen.getByLabelText("items.applyLateFee")).not.toBeChecked();
  submit();
  await waitFor(() =>
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        currencyCode: "USD",
        items: undefined,
      }),
    ),
  );
  expect(mockPush).toHaveBeenCalledWith("/es/payments/payment");
});
it("preserves manually entered payment details and principal when optional late fees are applied", async () => {
  render(<NewPaymentPage />);
  await chooseLease();
  fireEvent.change(screen.getByLabelText("amount *"), {
    target: { value: "75.25" },
  });
  fireEvent.change(screen.getByLabelText("date *"), {
    target: { value: "2026-10-02" },
  });
  fireEvent.change(screen.getByLabelText("method.label *"), {
    target: { value: "cash" },
  });
  fireEvent.change(screen.getByLabelText("Actividad *"), {
    target: { value: "extraordinary" },
  });
  fireEvent.change(screen.getByLabelText("title *"), {
    target: { value: "ARS" },
  });
  fireEvent.change(screen.getByLabelText("reference"), {
    target: { value: "REF-42" },
  });
  fireEvent.change(screen.getByLabelText("notes"), {
    target: { value: "Partial collection" },
  });
  fireEvent.click(screen.getByLabelText("items.applyLateFee"));
  expect(screen.getByLabelText("amount *")).toHaveValue(95.25);
  fireEvent.click(screen.getByLabelText("items.applyLateFee"));
  expect(screen.getByLabelText("amount *")).toHaveValue(75.25);
  fireEvent.click(screen.getByLabelText("items.applyLateFee"));
  submit();
  await waitFor(() =>
    expect(payments.create).toHaveBeenCalledWith({
      tenantAccountId: "account",
      amount: 95.25,
      currencyCode: "ARS",
      paymentDate: "2026-10-02",
      method: "cash",
      activityType: "extraordinary",
      reference: "REF-42",
      notes: "Partial collection",
      items: [
        { description: "amount", amount: 75.25, quantity: 1, type: "charge" },
        {
          description: "items.lateFee",
          amount: 20,
          quantity: 1,
          type: "charge",
        },
      ],
    }),
  );
});
it("calculates variable charges, quantities and discounts and restores direct amount editing after removal", async () => {
  render(<NewPaymentPage />);
  await chooseLease();
  fireEvent.click(screen.getByRole("button", { name: "Agregar detalle" }));
  expect(screen.getByText("items.empty")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "items.add" }));
  fireEvent.click(screen.getByRole("button", { name: "items.add" }));
  function editRow(
    index: number,
    description: string,
    amount: string,
    quantity: string,
    type: string,
  ) {
    fireEvent.change(
      screen.getAllByPlaceholderText("items.description")[index],
      { target: { value: description } },
    );
    let row =
      screen.getAllByPlaceholderText("items.description")[index].parentElement!;
    fireEvent.change(row.querySelectorAll("input[type=number]")[0], {
      target: { value: amount },
    });
    row =
      screen.getAllByPlaceholderText("items.description")[index].parentElement!;
    fireEvent.change(row.querySelectorAll("input[type=number]")[1], {
      target: { value: quantity },
    });
    row =
      screen.getAllByPlaceholderText("items.description")[index].parentElement!;
    fireEvent.change(row.querySelector("select")!, { target: { value: type } });
  }
  editRow(0, "Rent", "50", "2", "charge");
  editRow(1, "Discount", "10", "1", "discount");
  expect(screen.getByLabelText("amount *")).toHaveValue(90);
  expect(screen.getByLabelText("amount *")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("items.applyLateFee"));
  expect(screen.getByLabelText("amount *")).toHaveValue(110);
  fireEvent.click(screen.getByLabelText("items.applyLateFee"));
  fireEvent.click(screen.getAllByRole("button", { name: "items.remove" })[1]);
  expect(screen.getByLabelText("amount *")).toHaveValue(100);
  fireEvent.click(screen.getAllByRole("button", { name: "items.remove" })[0]);
  expect(screen.getByLabelText("amount *")).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Ocultar detalle" }));
  expect(screen.queryByText("items.empty")).not.toBeInTheDocument();
});
it.each([0, -1, NaN])(
  "rejects invalid direct payment amount %s",
  async (amount) => {
    render(<NewPaymentPage />);
    await chooseLease();
    fireEvent.change(screen.getByLabelText("amount *"), {
      target: { value: String(amount) },
    });
    submit();
    expect(payments.create).not.toHaveBeenCalled();
  },
);
it("keeps row focus while typing and serializes exact cents without UI row identifiers", async () => {
  render(<NewPaymentPage />);
  await chooseLease();
  fireEvent.click(screen.getByRole("button", { name: "Agregar detalle" }));
  fireEvent.click(screen.getByRole("button", { name: "items.add" }));
  fireEvent.click(screen.getByRole("button", { name: "items.add" }));
  const description = screen.getAllByPlaceholderText("items.description")[0];
  description.focus();
  fireEvent.change(description, { target: { value: "First cents" } });
  expect(document.activeElement).toBe(description);
  const rows = screen
    .getAllByPlaceholderText("items.description")
    .map((field) => field.parentElement!);
  fireEvent.change(rows[0].querySelector("input[type=number]")!, {
    target: { value: "0.1" },
  });
  fireEvent.change(rows[1].querySelector("input[type=number]")!, {
    target: { value: "0.2" },
  });
  expect(screen.getByLabelText("amount *")).toHaveValue(0.3);
  submit();
  await waitFor(() =>
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 0.3,
        items: [
          {
            description: "First cents",
            amount: 0.1,
            quantity: 1,
            type: "charge",
          },
          { description: "", amount: 0.2, quantity: 1, type: "charge" },
        ],
      }),
    ),
  );
});
it("distinguishes catalogue and account read failures and offers an explicit retry", async () => {
  jest.mocked(leasesApi.getAll).mockRejectedValueOnce(new Error("Offline"));
  accounts.getByLease.mockRejectedValueOnce(new Error("Denied"));
  render(<NewPaymentPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("readError");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  const selector = await screen.findByLabelText("selectLease");
  fireEvent.change(selector, { target: { value: "lease" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("readError");
  submit();
  expect(payments.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await waitFor(() =>
    expect(screen.getByLabelText("amount *")).toHaveValue(100),
  );
});
it("retains an uncertain request, locks editing, prevents parallel submits and recovers the same payload", async () => {
  payments.create.mockRejectedValueOnce(new Error("Network lost"));
  render(<NewPaymentPage />);
  await chooseLease();
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("uncertain");
  expect(screen.getByLabelText("amount *")).toBeDisabled();
  const original = payments.create.mock.calls[0][0];
  let resolve!: (value: never) => void;
  payments.create.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  submit();
  expect(payments.create).toHaveBeenCalledTimes(2);
  expect(payments.create.mock.calls[1][0]).toEqual(original);
  await act(async () => resolve({ id: "recovered" } as never));
  expect(mockPush).toHaveBeenCalledWith("/es/payments/recovered");
});
it("allows correcting a definitely rejected request without uncertain recovery", async () => {
  payments.create.mockRejectedValueOnce(
    new ApiRequestError(422, "Invalid amount"),
  );
  render(<NewPaymentPage />);
  await chooseLease();
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("rejected");
  expect(screen.getByLabelText("amount *")).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "recover" }),
  ).not.toBeInTheDocument();
});
it("never fabricates an account or positive payable amount for an empty or credit account", async () => {
  accounts.getByLease.mockResolvedValueOnce(null as never);
  render(<NewPaymentPage />);
  fireEvent.change(await screen.findByLabelText("selectLease"), {
    target: { value: "lease" },
  });
  await waitFor(() => expect(accounts.getByLease).toHaveBeenCalled());
  expect(accounts.getBalance).not.toHaveBeenCalled();
  submit();
  expect(payments.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "savePayment" })).toBeDisabled();
});
