import { isAiUiAction } from "./assistant-guidance";

describe("Assistant navigation", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  it.each([
    "contract_rental",
    "contract_sale",
    "receipt",
    "invoice",
    "credit_note",
  ])("opens the correct existing template scope %s", (scope) => {
    expect(
      isAiUiAction({
        type: "navigate",
        guide: "screen",
        path: `/templates/editor?scope=${scope}&templateId=${id}`,
      }),
    ).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "//evil.test",
    "/settings?next=https://evil.test",
    `/invoices/${id}?pay=mercadopago`,
    "/templates/editor?scope=payment",
    "/properties/not-a-uuid/edit",
  ])("rejects unsupported or side-effecting destinations %s", (path) => {
    expect(isAiUiAction({ type: "navigate", guide: "screen", path })).toBe(
      false,
    );
  });
  it("opens only cataloged alternative form controls", () => {
    expect(
      isAiUiAction({
        type: "navigate",
        guide: "screen",
        path: "/sales",
        openControl: "sale-folder",
      }),
    ).toBe(true);
    expect(
      isAiUiAction({
        type: "navigate",
        guide: "screen",
        path: "/sales",
        openControl: "save",
      }),
    ).toBe(false);
  });
});
