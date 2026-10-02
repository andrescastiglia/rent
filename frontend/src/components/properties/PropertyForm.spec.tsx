import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PropertyForm } from "./PropertyForm";
import { Property } from "@/types/property";

const mockRouter = { push: jest.fn(), refresh: jest.fn(), back: jest.fn() };
const mockOwners = { getAll: jest.fn() };
const mockProperties = {
  create: jest.fn(),
  update: jest.fn(),
  uploadImage: jest.fn(),
  discardUploadedImages: jest.fn(),
};
const mockCurrency = { getAll: jest.fn(), getDefaultForLocale: jest.fn() };
let mockParams = new URLSearchParams();
let mockUser = { role: "admin", roles: ["admin"] };
const mockTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({ useSearchParams: () => mockParams }));
jest.mock("@/hooks/useLocalizedRouter", () => ({
  useLocalizedRouter: () => mockRouter,
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock("@/lib/api/owners", () => ({
  ownersApi: { getAll: (...args: unknown[]) => mockOwners.getAll(...args) },
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: {
    create: (...args: unknown[]) => mockProperties.create(...args),
    update: (...args: unknown[]) => mockProperties.update(...args),
    uploadImage: (...args: unknown[]) => mockProperties.uploadImage(...args),
    discardUploadedImages: (...args: unknown[]) =>
      mockProperties.discardUploadedImages(...args),
  },
}));
jest.mock("@/lib/api/currencies", () => ({
  currenciesApi: {
    getAll: (...args: unknown[]) => mockCurrency.getAll(...args),
    getDefaultForLocale: (...args: unknown[]) =>
      mockCurrency.getDefaultForLocale(...args),
  },
}));
jest.mock("./ImageUpload", () => ({
  ImageUpload: ({
    images,
    onUpload,
    onChange,
    onRemove,
  }: {
    images: string[];
    onUpload: (file: File) => Promise<string>;
    onChange: (images: string[]) => void;
    onRemove: () => Promise<void>;
  }) => (
    <div>
      <span>{images.join(",")}</span>
      <button
        type="button"
        onClick={async () => {
          const url = await onUpload(new File(["image"], "photo.png"));
          onChange([...images, url]);
        }}
      >
        Upload photo
      </button>
      <button
        type="button"
        onClick={async () => {
          await onRemove();
          onChange(images.slice(1));
        }}
      >
        Remove photo
      </button>
    </div>
  ),
}));

describe("PropertyForm", () => {
  const owner = {
    id: "owner",
    firstName: "Ana",
    lastName: "Gomez",
    phone: "5411123456",
  };
  const initial: Property = {
    id: "property",
    name: "Departamento",
    type: "APARTMENT",
    status: "ACTIVE",
    ownerId: "owner",
    address: {
      street: "Calle",
      number: "10",
      city: "Ciudad",
      state: "Provincia",
      zipCode: "1000",
      country: "Argentina",
    },
    features: [],
    units: [],
    images: [],
    operations: ["rent"],
    maxOccupants: 3,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  let alert: jest.SpyInstance;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = new URLSearchParams();
    mockUser = { role: "admin", roles: ["admin"] };
    mockOwners.getAll.mockResolvedValue([owner]);
    mockProperties.create.mockResolvedValue({ id: "created" });
    mockProperties.update.mockResolvedValue(initial);
    mockProperties.uploadImage.mockResolvedValue("/upload.png");
    mockProperties.discardUploadedImages.mockResolvedValue(undefined);
    mockCurrency.getAll.mockResolvedValue([
      { code: "ARS", symbol: "$" },
      { code: "USD", symbol: "US$" },
    ]);
    mockCurrency.getDefaultForLocale.mockResolvedValue({ code: "ARS" });
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
    const input = document.getElementById(id);
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value } });
  }
  async function fill() {
    await screen.findByRole("option", { name: "Ana Gomez" });
    change("name", "Departamento nuevo");
    change("ownerId", "owner");
    change("street", "Calle");
    change("number", "10");
    change("city", "Ciudad");
    change("state", "Provincia");
    change("zipCode", "1000");
    change("maxOccupants", "3");
  }
  function submit(container: HTMLElement) {
    fireEvent.submit(container.querySelector("form")!);
  }

  it("creates a property with validated address, owner and economic settings", async () => {
    const { container } = render(<PropertyForm />);
    await fill();
    submit(container);
    await waitFor(() =>
      expect(mockProperties.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Departamento nuevo",
          ownerId: "owner",
          address: expect.objectContaining({
            number: "10",
            country: "Argentina",
          }),
          operations: ["rent"],
          maxOccupants: 3,
        }),
      ),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/properties/created");
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("updates the existing property and preserves the locked owner contact", async () => {
    const { container } = render(
      <PropertyForm initialData={initial} isEditing />,
    );
    await screen.findByText("Ana Gomez");
    change("name", "Departamento editado");
    submit(container);
    await waitFor(() =>
      expect(mockProperties.update).toHaveBeenCalledWith(
        "property",
        expect.objectContaining({
          name: "Departamento editado",
          ownerId: "owner",
          ownerWhatsapp: owner.phone,
        }),
      ),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/properties/property");
  });

  it("uses a preselected owner and presents their contact without an editable owner field", async () => {
    mockParams = new URLSearchParams("ownerId=owner");
    const { container } = render(<PropertyForm initialData={initial} />);
    await screen.findByText("Ana Gomez");
    expect(container.querySelector("select#ownerId")).toBeNull();
    submit(container);
    await waitFor(() =>
      expect(mockProperties.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: "owner",
          ownerWhatsapp: owner.phone,
        }),
      ),
    );
  });

  it("rejects missing owner for administrators before calling the API", async () => {
    const { container } = render(
      <PropertyForm initialData={{ ...initial, ownerId: "" }} />,
    );
    await screen.findByRole("option", { name: "Ana Gomez" });
    submit(container);
    await waitFor(() => expect(alert).toHaveBeenCalledWith("ownerRequired"));
    expect(mockProperties.create).not.toHaveBeenCalled();
  });

  it("shows validation errors and does not save an incomplete address", async () => {
    const { container } = render(<PropertyForm />);
    submit(container);
    await screen.findByText("streetRequired");
    expect(screen.getAllByText("required").length).toBeGreaterThan(0);
    expect(mockProperties.create).not.toHaveBeenCalled();
  });

  it("requires one operation and clears rental values when only sale remains", async () => {
    render(<PropertyForm initialData={{ ...initial, rentPrice: 100 }} />);
    const rent = screen.getByLabelText("operations.rent");
    const sale = screen.getByLabelText("operations.sale");
    fireEvent.click(rent);
    expect(rent).toBeChecked();
    fireEvent.click(sale);
    expect(sale).toBeChecked();
    fireEvent.click(rent);
    expect(rent).not.toBeChecked();
    await waitFor(() =>
      expect(screen.getByLabelText("fields.rentPrice")).toBeDisabled(),
    );
    fireEvent.click(sale);
    expect(sale).toBeChecked();
    fireEvent.change(screen.getByLabelText("fields.salePrice"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByLabelText("fields.saleCurrency"), {
      target: { value: "USD" },
    });
    expect(screen.getByLabelText("fields.saleCurrency")).toHaveValue("USD");
  });

  it("edits guarantee and feature fields and can remove a feature before save", async () => {
    render(<PropertyForm initialData={initial} />);
    change("acceptedGuaranteeTypes", "garante");
    fireEvent.click(screen.getByRole("button", { name: "addFeature" }));
    const name = screen.getByPlaceholderText("fields.featureName");
    fireEvent.change(name, { target: { value: "Balcón" } });
    fireEvent.change(
      screen.getByPlaceholderText("fields.featureValue (optional)"),
      { target: { value: "Amplio" } },
    );
    const row = name.parentElement!.parentElement!;
    fireEvent.click(row.querySelector("button")!);
    expect(screen.getByText("noFeatures")).toBeInTheDocument();
  });

  it("does not offer a staff user the administrator owner selector", async () => {
    mockUser = { role: "staff", roles: ["staff"] };
    const { container } = render(<PropertyForm />);
    await waitFor(() => expect(mockOwners.getAll).toHaveBeenCalledTimes(1));
    expect(container.querySelector("select#ownerId")).toBeNull();
  });

  it("cleans newly uploaded images on cancellation and navigates back", async () => {
    render(<PropertyForm initialData={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    await waitFor(() =>
      expect(mockProperties.uploadImage).toHaveBeenCalledTimes(1),
    );
    await screen.findByText("/upload.png");
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    await waitFor(() =>
      expect(mockProperties.discardUploadedImages).toHaveBeenCalledWith([
        "/upload.png",
      ]),
    );
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("cleans abandoned uploads when the form unmounts", async () => {
    const { unmount } = render(<PropertyForm initialData={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    await waitFor(() =>
      expect(mockProperties.uploadImage).toHaveBeenCalledTimes(1),
    );
    await act(async () => undefined);
    unmount();
    expect(mockProperties.discardUploadedImages).toHaveBeenCalledWith([
      "/upload.png",
    ]);
  });

  it("discards images removed before persistence and keeps retained uploads after success", async () => {
    const { container, unmount } = render(
      <PropertyForm initialData={initial} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    await waitFor(() =>
      expect(mockProperties.uploadImage).toHaveBeenCalledTimes(1),
    );
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await act(async () => undefined);
    submit(container);
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(mockProperties.discardUploadedImages).toHaveBeenCalledWith([
      "/upload.png",
    ]);
    mockProperties.discardUploadedImages.mockClear();
    unmount();
    expect(mockProperties.discardUploadedImages).not.toHaveBeenCalled();
  });

  it("reports a failed save and releases the submit control for retry", async () => {
    mockProperties.create.mockRejectedValue(new Error("save unavailable"));
    const { container } = render(<PropertyForm initialData={initial} />);
    await screen.findByRole("option", { name: "Ana Gomez" });
    submit(container);
    await waitFor(() => expect(alert).toHaveBeenCalledWith("error"));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "saveProperty" })).toBeEnabled();
  });

  it("survives owner lookup failure and reports the error", async () => {
    mockOwners.getAll.mockRejectedValue(new Error("lookup unavailable"));
    render(<PropertyForm />);
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to load owners",
        expect.any(Error),
      ),
    );
    expect(
      screen.getByRole("button", { name: "saveProperty" }),
    ).toBeInTheDocument();
  });
});
