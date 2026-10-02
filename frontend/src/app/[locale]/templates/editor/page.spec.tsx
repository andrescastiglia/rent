import messages from "../../../../../messages/es.json";
const mockRichEditorMessages: Record<string, string> =
  messages.templatesHub.richEditor;
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "./page";
import { leasesApi } from "@/lib/api/leases";
import { paymentDocumentTemplatesApi } from "@/lib/api/payments";
const mockTranslate = (key: string) =>
  key.startsWith("richEditor.") ? mockRichEditorMessages[key.slice(11)] : key;
let mockParams = new URLSearchParams("scope=contract_rental");
const mockPush = jest.fn();
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockParams,
}));
jest.mock("@/lib/api/leases", () => ({
  leasesApi: {
    getTemplates: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    importTemplateDocx: jest.fn(),
  },
}));
jest.mock("@/lib/api/payments", () => ({
  paymentDocumentTemplatesApi: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));
const contracts = jest.mocked(leasesApi),
  documents = jest.mocked(paymentDocumentTemplatesApi);
const template = {
  id: "template",
  name: "Contrato",
  templateBody: "Canon {{lease.rent}}",
  templateFormat: "plain_text",
  isActive: true,
  isDefault: false,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = new URLSearchParams("scope=contract_rental");
  contracts.getTemplates.mockResolvedValue([template] as never);
  documents.list.mockResolvedValue([template] as never);
  contracts.createTemplate.mockResolvedValue(template as never);
  contracts.updateTemplate.mockResolvedValue(template as never);
  documents.create.mockResolvedValue(template as never);
  documents.update.mockResolvedValue(template as never);
  jest.spyOn(window, "alert").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const name = (value: string) =>
  fireEvent.change(screen.getByLabelText("namePlaceholder"), {
    target: { value },
  });
const body = (value: string) =>
  fireEvent.change(screen.getByLabelText("bodyPlaceholder"), {
    target: { value },
  });
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "save" }));
const mount = async () => {
  const view = render(<Page />);
  await screen.findByLabelText("namePlaceholder");
  return view;
};
it.each(["contract_rental", "contract_sale"])(
  "creates a %s contract template with reviewed fields",
  async (scope) => {
    mockParams = new URLSearchParams("scope=" + scope);
    await mount();
    save();
    expect(contracts.createTemplate).not.toHaveBeenCalled();
    name(" Modelo ");
    body("Canon actualizado");
    save();
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/es/templates?scope=" + scope),
    );
    expect(contracts.createTemplate).toHaveBeenCalledWith({
      contractType: scope === "contract_sale" ? "sale" : "rental",
      name: "Modelo",
      templateBody: "Canon actualizado",
      templateFormat: "plain_text",
      isActive: true,
    });
  },
);
it.each(["invoice", "receipt", "credit_note"])(
  "creates a %s document template and maintains the default/active invariant",
  async (scope) => {
    mockParams = new URLSearchParams("scope=" + scope);
    await mount();
    name("Documento");
    body("Total");
    fireEvent.click(screen.getByLabelText("activeLabel"));
    fireEvent.click(screen.getByLabelText("defaultLabel"));
    expect(screen.getByLabelText("activeLabel")).toBeChecked();
    save();
    await waitFor(() =>
      expect(documents.create).toHaveBeenCalledWith({
        type: scope,
        name: "Documento",
        templateBody: "Total",
        isActive: true,
        isDefault: true,
      }),
    );
    expect(contracts.createTemplate).not.toHaveBeenCalled();
  },
);
it.each(["contract_rental", "invoice"])(
  "loads and updates an existing %s template",
  async (scope) => {
    mockParams = new URLSearchParams("scope=" + scope + "&templateId=template");
    await mount();
    expect(screen.getByLabelText("namePlaceholder")).toHaveValue("Contrato");
    name("Editado");
    body("Nuevo texto");
    fireEvent.click(screen.getByLabelText("activeLabel"));
    save();
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(
      scope === "invoice" ? documents.update : contracts.updateTemplate,
    ).toHaveBeenCalledWith(
      "template",
      expect.objectContaining({
        name: "Editado",
        templateBody: "Nuevo texto",
        isActive: false,
      }),
    );
  },
);
it.each(["contract_rental", "invoice"])(
  "shows a missing %s template without overwriting it",
  async (scope) => {
    mockParams = new URLSearchParams("scope=" + scope + "&templateId=missing");
    await render(<Page />);
    expect(await screen.findByText("templateNotFound")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "save" }),
    ).not.toBeInTheDocument();
  },
);
it("recovers visibly from read and save failures without navigation", async () => {
  contracts.getTemplates.mockRejectedValueOnce(new Error("offline"));
  mockParams = new URLSearchParams("scope=contract_rental&templateId=template");
  const view = render(<Page />);
  await screen.findByText("templateNotFound");
  view.unmount();
  mockParams = new URLSearchParams("scope=contract_rental");
  await mount();
  name("Nuevo");
  body("Contrato");
  contracts.createTemplate.mockRejectedValueOnce(new Error("lost"));
  save();
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith("error"));
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByLabelText("bodyPlaceholder")).toHaveValue("Contrato");
});
it("inserts variables in plain text and sanitized rich HTML while retaining formatting and focus", async () => {
  await mount();
  name("HTML");
  body("Texto");
  const tokenButton = screen.getAllByRole("button", { name: /^\{\{/ })[0];
  const token = tokenButton.textContent!;
  fireEvent.click(tokenButton);
  expect(screen.getByLabelText("bodyPlaceholder")).toHaveValue(
    "Texto\n" + token,
  );
  fireEvent.click(screen.getByRole("button", { name: "Formato enriquecido" }));
  const editor = screen.getByRole("textbox", { name: "bodyPlaceholder" });
  expect(editor).toHaveAttribute("aria-multiline", "true");
  expect(editor).toHaveAttribute("contenteditable", "true");
  editor.innerHTML = "<p><strong>Canon</strong><script>danger()</script></p>";
  fireEvent.input(editor);
  expect(editor.querySelector("strong")).toHaveTextContent("Canon");
  expect(editor.querySelector("script")).toBeNull();
  fireEvent.click(tokenButton);
  expect(editor).toHaveFocus();
  save();
  await waitFor(() => expect(contracts.createTemplate).toHaveBeenCalled());
  expect(contracts.createTemplate.mock.calls[0][0].templateBody).toContain(
    "<strong>Canon</strong>",
  );
  expect(contracts.createTemplate.mock.calls[0][0].templateBody).not.toContain(
    "script",
  );
});
it("formats selected rich text and creates blocks and lists without losing the content", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Formato enriquecido" }));
  const editor = screen.getByRole("textbox", { name: "bodyPlaceholder" });
  editor.innerHTML = "<p>Canon mensual</p>";
  fireEvent.input(editor);
  const selection = window.getSelection()!;
  const selectText = () => {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor.querySelector("p")!);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  selectText();
  fireEvent.click(screen.getByRole("button", { name: "Negrita" }));
  expect(editor.querySelector("strong")).toHaveTextContent("Canon mensual");
  selectText();
  fireEvent.click(screen.getByRole("button", { name: "Cursiva" }));
  expect(editor.querySelector("em")).toHaveTextContent("Canon mensual");
  editor.innerHTML = "<h2>Canon mensual</h2>";
  fireEvent.input(editor);
  editor.focus();
  const headingRange = document.createRange();
  headingRange.selectNodeContents(editor.querySelector("h2")!);
  selection.removeAllRanges();
  selection.addRange(headingRange);
  fireEvent.click(screen.getByRole("button", { name: "Parrafo" }));
  expect(editor.querySelector("p")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Lista" }));
  expect(editor.querySelector("ul")).not.toBeNull();
  expect(editor.textContent).toContain("Canon mensual");
});
it("imports DOCX and retains prior fields when the import has missing metadata", async () => {
  contracts.importTemplateDocx.mockResolvedValue({
    templateBody: "<p>Importado</p>",
  } as never);
  const { container } = await mount();
  name("Modelo");
  const file = new File(["docx"], "contrato.docx");
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "bodyPlaceholder" }),
    ).toHaveTextContent("Importado"),
  );
  expect(contracts.importTemplateDocx).toHaveBeenCalledWith(
    file,
    "rental",
    "Modelo",
  );
  name("Modelo");
  contracts.importTemplateDocx.mockRejectedValueOnce(new Error("invalid"));
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: { files: [file] },
  });
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith("error"));
  expect(
    screen.getByRole("textbox", { name: "bodyPlaceholder" }),
  ).toHaveTextContent("Importado");
});
