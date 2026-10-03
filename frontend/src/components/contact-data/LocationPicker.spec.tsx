import { fireEvent, render, screen } from "@testing-library/react";
import { LocationPicker } from "./LocationPicker";
import { contactApi } from "@/lib/api/contact-data";
jest.mock("@/lib/api/contact-data", () => ({
  contactApi: { places: jest.fn() },
}));
it("selects registered destinations and falls back to contact address", async () => {
  const onChange = jest.fn();
  (contactApi.places as jest.Mock).mockResolvedValue([
    { type: "property", id: "home", name: "Casa", address: "Mitre 100" },
  ]);
  const ui = render(
    <LocationPicker value={{ type: "owner", id: "old" }} onChange={onChange} />,
  );
  expect(screen.getByText("Destino registrado")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar lugar registrado"), {
    target: { value: "Mitre" },
  });
  fireEvent.click(screen.getByText("Buscar lugares"));
  await screen.findByText(/Casa/);
  fireEvent.change(screen.getByLabelText("Lugar registrado"), {
    target: { value: "property:home" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ type: "property", id: "home" });
  ui.rerender(
    <LocationPicker
      value={{ type: "property", id: "home" }}
      onChange={onChange}
    />,
  );
  expect(screen.queryByText("Destino registrado")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Lugar registrado"), {
    target: { value: "" },
  });
  expect(onChange).toHaveBeenLastCalledWith(null);
});
it("reports search failures and allows another attempt", async () => {
  (contactApi.places as jest.Mock).mockRejectedValue(new Error("offline"));
  render(<LocationPicker value={null} onChange={jest.fn()} />);
  fireEvent.click(screen.getByText("Buscar lugares"));
  await screen.findByRole("alert");
  expect(screen.getByText("Buscar lugares")).toBeEnabled();
});
