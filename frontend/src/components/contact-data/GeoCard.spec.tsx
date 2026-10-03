jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "actor", companyId: "company-a" } }),
}));
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GeoCard } from "./GeoCard";
import { contactApi } from "@/lib/api/contact-data";
jest.mock("@/lib/api/contact-data", () => ({
  contactApi: {
    config: jest.fn(),
    destination: jest.fn(),
    entry: jest.fn(),
    image: jest.fn(),
    eta: jest.fn(),
  },
}));
const point = {
  type: "property" as const,
  id: "test",
  name: "Casa",
  address: "Mitre 100",
  latitude: -34.6,
  longitude: -58.4,
  precise: true,
};
describe("temporary visit map", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (contactApi.config as jest.Mock).mockResolvedValue({ maps: true });
    (contactApi.destination as jest.Mock).mockResolvedValue(point);
    (contactApi.image as jest.Mock).mockResolvedValue("blob:temporary");
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: jest.fn((_ok, fail) => fail({ code: 1 })) },
    });
  });
  it("hides numeric coordinates, preserves explicit navigation when ETA fails, and releases the image", async () => {
    const { unmount } = render(<GeoCard location={point} />);
    await screen.findByRole("img");
    expect(screen.queryByText(/-34\.6|-58\.4/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Calcular tiempo de llegada" }),
    );
    await screen.findByRole("alert");
    const link = screen.getByRole("link", { name: "Ir ahí" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("href")).toContain("destination=-34.6%2C-58.4");
    expect(contactApi.eta).not.toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:temporary");
  });
  it("discards an ETA that resolves after the destination changes", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: jest.fn((ok) =>
          ok({
            coords: { latitude: -34.6, longitude: -58.4, accuracy: 10 },
            timestamp: Date.now(),
          }),
        ),
      },
    });
    let finish!: (result: unknown) => void;
    (contactApi.eta as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender } = render(<GeoCard location={point} />);
    await screen.findByRole("img");
    fireEvent.click(
      screen.getByRole("button", { name: "Calcular tiempo de llegada" }),
    );
    await waitFor(() => expect(contactApi.eta).toHaveBeenCalled());
    const next = { ...point, id: "another", address: "Belgrano 200" };
    (contactApi.destination as jest.Mock).mockResolvedValue(next);
    rerender(<GeoCard location={next} />);
    await screen.findByText(next.address);
    finish({
      durationSeconds: 120,
      distanceMeters: 1000,
      arrivesAt: new Date().toISOString(),
      mode: "driving",
      traffic: false,
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Calcular llegada" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText(/Llegada estimada/)).not.toBeInTheDocument();
  });
  it("keeps navigation available when the image quota is exhausted", async () => {
    (contactApi.image as jest.Mock).mockRejectedValue(new Error("quota"));
    render(<GeoCard location={point} />);
    await screen.findByText("Imagen temporalmente no disponible");
    expect(screen.getByRole("link", { name: "Ir ahí" })).toBeInTheDocument();
  });
  it("does not contact image providers when disabled", async () => {
    (contactApi.config as jest.Mock).mockResolvedValue({ maps: false });
    render(<GeoCard location={point} />);
    await waitFor(() => expect(contactApi.config).toHaveBeenCalled());
    expect(contactApi.image).not.toHaveBeenCalled();
    expect(contactApi.destination).not.toHaveBeenCalled();
  });
});
