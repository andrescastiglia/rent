import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContactTools } from "./ContactTools";
import { contactApi } from "@/lib/api/contact-data";
import type { ContactInput } from "@/lib/contact-types";
jest.mock("@/lib/api/contact-data", () => ({
  contactApi: { config: jest.fn(), phone: jest.fn(), search: jest.fn() },
}));
function Form() {
  const [draft, setDraft] = useState<ContactInput>({});
  return (
    <>
      <ContactTools
        value={draft}
        onChange={setDraft}
        phones={{ phone: "01143215678" }}
      />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  );
}
describe("optional phone proposal", () => {
  it("waits for explicit acceptance and does not activate address normalization", async () => {
    (contactApi.config as jest.Mock).mockResolvedValue({ normalization: true });
    (contactApi.phone as jest.Mock).mockResolvedValue({
      original: "01143215678",
      country: "AR",
      possible: true,
      valid: true,
      e164: "+541143215678",
      international: "+54 11 4321-5678",
      extension: null,
    });
    render(<Form />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Normalizar teléfono" }),
    );
    await screen.findByText("+54 11 4321-5678");
    expect(screen.getByTestId("draft")).toHaveTextContent("{}");
    fireEvent.click(screen.getByRole("button", { name: /Aceptar/ }));
    expect(JSON.parse(screen.getByTestId("draft").textContent ?? "{}")).toEqual(
      {
        normalization: {
          phones: { phone: "AR" },
          phoneOriginals: { phone: "01143215678" },
        },
      },
    );
    expect(contactApi.search).not.toHaveBeenCalled();
  });
});
