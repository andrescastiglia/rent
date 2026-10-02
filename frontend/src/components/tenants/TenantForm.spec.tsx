import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { TenantForm } from "./TenantForm";
import { Tenant } from "@/types/tenant";
import { ApiRequestError } from "@/lib/api";

const mockRouter = { push: jest.fn(), refresh: jest.fn(), back: jest.fn() };
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockTranslate = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => mockTranslate }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => mockRouter,
}));
jest.mock("@/lib/api/tenants", () => ({
  tenantsApi: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

describe("TenantForm", () => {
  const initial = {
    id: "tenant",
    firstName: "Ana",
    lastName: "Gomez",
    dni: "12345678",
    email: "ana@example.invalid",
    phone: "12345678",
    status: "ACTIVE",
    contactConsent: false,
    preferredContactChannel: "whatsapp",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as Tenant;
  let alert: jest.SpyInstance;
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue(initial);
    mockUpdate.mockResolvedValue(initial);
    alert = jest.spyOn(window, "alert").mockImplementation(() => undefined);
    consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    alert.mockRestore();
    consoleError.mockRestore();
  });
  function change(id: string, value: string) {
    const element = document.getElementById(id);
    expect(element).not.toBeNull();
    fireEvent.change(element!, { target: { value } });
  }
  function submit(container: HTMLElement) {
    fireEvent.submit(container.querySelector("form")!);
  }
  function fill() {
    change("tenant-first-name", "Ana");
    change("tenant-last-name", "Gomez");
    change("tenant-dni", "12345678");
    change("tenant-email", "ana@example.invalid");
    change("tenant-phone", "12345678");
  }

  it("creates the tenant and forwards supported personal and employment fields", async () => {
    const { container } = render(<TenantForm />);
    fill();
    change("tenant-cuil", "20123456789");
    change("tenant-date-of-birth", "1990-02-10");
    change("tenant-nationality", "AR");
    change("tenant-employment-status", "employed");
    change("tenant-occupation", "Analista");
    change("tenant-employer", "Empresa");
    change("tenant-monthly-income", "50000");
    change("tenant-credit-score", "700");
    change("tenant-emergency-contact-name", "Juan");
    change("tenant-emergency-contact-phone", "123456");
    change("tenant-emergency-contact-relationship", "Hermano");
    change("tenant-notes", "Referencia");
    submit(container);
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: "Ana",
          cuil: "20123456789",
          monthlyIncome: 50000,
          creditScore: 700,
          emergencyContactRelationship: "Hermano",
          employmentStatus: "employed",
          notes: "Referencia",
        }),
      ),
    );
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("address");
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("status");
    expect(mockRouter.push).toHaveBeenCalledWith("/tenants");
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("updates the existing profile including its email without touching credentials", async () => {
    const { container } = render(
      <TenantForm initialData={initial} isEditing />,
    );
    change("tenant-email", "new@example.invalid");
    change("tenant-monthly-income", "0");
    change("tenant-credit-score", "0");
    submit(container);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "tenant",
        expect.objectContaining({
          email: "new@example.invalid",
          monthlyIncome: 0,
          creditScore: 0,
        }),
      ),
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("password");
    expect(mockRouter.push).toHaveBeenCalledWith("/tenants/tenant");
  });

  it("leaves optional numeric and employment fields undefined when blank", async () => {
    const { container } = render(<TenantForm />);
    fill();
    submit(container);
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      monthlyIncome: undefined,
      creditScore: undefined,
      employmentStatus: undefined,
    });
  });

  it("supports a person without email or requested access", async () => {
    const { container } = render(<TenantForm />);
    fill();
    change("tenant-email", "");
    submit(container);
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0].email).toBe("");
  });

  it("shows accessible field errors instead of saving invalid personal information", async () => {
    const { container } = render(<TenantForm />);
    submit(container);
    await waitFor(() =>
      expect(screen.getByLabelText("fields.firstName")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(screen.getByLabelText("fields.firstName")).toHaveAttribute(
      "aria-describedby",
      "tenant-first-name-error",
    );
    expect(screen.getByText("invalidDni")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["tenant-email", "bad-email", /Invalid email|invalidEmail/],
    ["tenant-phone", "1", "invalidPhone"],
  ])("rejects an invalid %s value", async (id, value, error) => {
    const { container } = render(<TenantForm />);
    fill();
    change(id, value);
    submit(container);
    await screen.findByText(error);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("cancels without saving a partially completed profile", () => {
    render(<TenantForm />);
    change("tenant-first-name", "Ana");
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("shows the pending state until the response has been resolved", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mockCreate.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { container } = render(<TenantForm />);
    fill();
    submit(container);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "saving" })).toBeDisabled(),
    );
    expect(container.querySelector("form")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await act(async () => resolve(initial));
    expect(mockRouter.push).toHaveBeenCalledWith("/tenants");
  });

  it("preserves an uncertain save for explicit recovery and freezes editing", async () => {
    mockCreate.mockRejectedValue(new Error("save unavailable"));
    const { container } = render(<TenantForm />);
    fill();
    submit(container);
    await screen.findByText("uncertain");
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("fields.firstName")).toHaveValue("Ana");
    expect(screen.getByLabelText("fields.firstName")).toBeDisabled();
    expect(screen.getByRole("button", { name: "saveTenant" })).toBeDisabled();
    const attempted = mockCreate.mock.calls[0][0];
    mockCreate.mockResolvedValue(initial);
    fireEvent.click(screen.getByRole("button", { name: "recover" }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith("/tenants"),
    );
    expect(mockCreate).toHaveBeenNthCalledWith(2, attempted);
  });

  it("allows correcting a definitely rejected profile without creating a recovery state", async () => {
    mockCreate.mockRejectedValue(new ApiRequestError(400, "invalid profile"));
    const { container } = render(<TenantForm />);
    fill();
    submit(container);
    await screen.findByText("rejected");
    expect(screen.getByRole("button", { name: "saveTenant" })).toBeEnabled();
    expect(screen.getByLabelText("fields.firstName")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "recover" })).toBeNull();
  });
});
