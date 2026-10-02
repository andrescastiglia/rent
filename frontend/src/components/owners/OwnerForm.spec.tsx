import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { OwnerForm } from "./OwnerForm";
import { Owner } from "@/types/owner";
const mockRouter = { push: jest.fn(), refresh: jest.fn(), back: jest.fn() };
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockTranslate = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => mockTranslate }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => mockRouter,
}));
jest.mock("@/lib/api/owners", () => ({
  ownersApi: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

describe("OwnerForm", () => {
  const owner = {
    id: "owner",
    firstName: "Ana",
    lastName: "Gomez",
    email: "ana@example.invalid",
    phone: "123456",
    taxId: "20123456789",
    notes: "Nota",
    contactConsent: true,
    preferredContactChannel: "email",
  } as Owner;
  let alert: jest.SpyInstance;
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue(owner);
    mockUpdate.mockResolvedValue(owner);
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
    fireEvent.change(document.getElementById(id)!, { target: { value } });
  }

  it("requires a meaningful first and last name before saving", () => {
    const { container } = render(<OwnerForm />);
    expect(container.querySelector("button[type=submit]")).toBeDisabled();
    change("firstName", "   ");
    change("lastName", "Gomez");
    fireEvent.submit(container.querySelector("form")!);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(container.querySelector("button[type=submit]")).toBeDisabled();
  });
  it("creates a person without inventing contact details or authentication", async () => {
    const { container } = render(<OwnerForm />);
    change("firstName", " Ana ");
    change("lastName", " Gomez ");
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        firstName: "Ana",
        lastName: "Gomez",
        email: undefined,
        phone: undefined,
        taxId: undefined,
        notes: undefined,
        contactConsent: false,
        preferredContactChannel: "whatsapp",
      }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/properties");
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });
  it("updates identity, contact and recorded consent on the existing owner", async () => {
    const { container } = render(<OwnerForm initialData={owner} isEditing />);
    change("email", " other@example.invalid ");
    change("phone", " 654321 ");
    change("taxId", " 20999999999 ");
    change("ownerPreferredContactChannel", "sms");
    fireEvent.click(
      screen.getByLabelText("Consentimiento para comunicaciones registrado"),
    );
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "owner",
        expect.objectContaining({
          email: "other@example.invalid",
          phone: "654321",
          taxId: "20999999999",
          contactConsent: false,
          preferredContactChannel: "sms",
          notes: "Nota",
        }),
      ),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it("supports an existing owner whose optional contact fields are absent", async () => {
    const { container } = render(
      <OwnerForm
        initialData={{
          ...owner,
          email: undefined,
          phone: undefined,
          taxId: undefined,
          notes: undefined,
          contactConsent: undefined,
          preferredContactChannel: undefined,
        }}
        isEditing
      />,
    );
    expect(screen.getByLabelText("ownerFields.email")).toHaveValue("");
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "owner",
        expect.objectContaining({
          preferredContactChannel: "whatsapp",
          contactConsent: false,
        }),
      ),
    );
  });
  it("keeps the submit disabled while the API response is pending", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mockCreate.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { container } = render(<OwnerForm initialData={owner} />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() =>
      expect(container.querySelector("button[type=submit]")).toBeDisabled(),
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
    await act(async () => resolve(owner));
    expect(mockRouter.push).toHaveBeenCalledWith("/properties");
  });
  it("reports a failed save and permits a corrected retry", async () => {
    mockCreate.mockRejectedValue(new Error("unavailable"));
    const { container } = render(<OwnerForm initialData={owner} />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(alert).toHaveBeenCalledWith("error"));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(container.querySelector("button[type=submit]")).toBeEnabled();
  });
  it("cancels without submitting the edited owner", () => {
    render(<OwnerForm initialData={owner} isEditing />);
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
