import {
  chooseGuidance,
  guidanceBlocked,
  guidanceDelay,
  guidanceRules,
  isAvailableControl,
  screenGuidance,
} from "./contextual-guidance";

beforeEach(() => {
  document.body.innerHTML =
    '<main id="main"><input id="properties-search" aria-label="Dirección" /><form><label for="start">Fecha de inicio</label><input id="start" required /><button id="save" type="submit">Guardar contrato</button></form></main>';
  jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 160,
    height: 44,
    top: 50,
    bottom: 94,
    left: 20,
    right: 180,
    x: 20,
    y: 50,
    toJSON: () => ({}),
  });
});
afterEach(() => jest.restoreAllMocks());

describe("explicit screen rules", () => {
  it.each([
    ["/es/dashboard", "dashboard"],
    ["/en/properties", "properties"],
    ["/pt/properties/owners/3/edit", "owners"],
    ["/es/portal/owner", "portal"],
    ["/es/payments/new", "payments"],
    ["/es/leases/3/edit", "leases"],
    ["/es/sales", "sales"],
    ["/es/interested/3", "people"],
    ["/es/maintenance", "maintenance"],
    ["/es/invoices", "invoices"],
    ["/es/reports", "reports"],
    ["/es/users", "users"],
    ["/es/settings", "settings"],
    ["/es/templates/editor", "templates"],
  ])("resolves %s", (path, screen) =>
    expect(screenGuidance(path)?.screen).toBe(screen),
  );
  it("does not guide authentication or unrelated routes", () => {
    expect(screenGuidance("/es/login")).toBeUndefined();
    expect(screenGuidance("/es/privacy")).toBeUndefined();
    expect(guidanceRules.every((rule) => rule.entry && rule.review)).toBe(true);
  });
  it.each([
    [undefined, 8000],
    ["", 8000],
    ["9000", 9000],
    [12000, 12000],
    ["bad", 8000],
    [999, 8000],
    [300001, 8000],
  ])("validates delay %s", (value, expected) =>
    expect(guidanceDelay(value, 8000)).toBe(expected),
  );
});

describe("guidance eligibility and progression", () => {
  const root = () => document.getElementById("main")!;
  const rule = () => screenGuidance("/es/properties")!;
  const input = () => document.getElementById("start") as HTMLInputElement;
  it.each([
    ["properties", "property-open", "propertyOpen"],
    ["owners", "owner-open", "ownerOpen"],
    ["payments", "payment-open", "paymentOpen"],
    ["sales", "sale-open", "saleOpen"],
    ["tenants", "person-open", "personOpen"],
    ["maintenance", "maintenance-open", "maintenanceOpen"],
    ["invoices", "invoice-open", "invoiceOpen"],
    ["users", "user-open", "userOpen"],
  ])(
    "guides a filtered %s list to its explicit read action",
    (path, marker, message) => {
      document.body.innerHTML = `<main id="main"><input type="search" value="Entered filter" /><button data-guide="${marker}">Consultar</button></main>`;
      const next = chooseGuidance(
        root(),
        screenGuidance(`/es/${path}`)!,
        "task",
        new Set(),
      );
      expect(next?.target).toBe(
        root().querySelector(`[data-guide="${marker}"]`),
      );
      expect(next?.message).toBe(message);
      expect(root().querySelector("input")?.value).toBe("Entered filter");
    },
  );
  it("guides a property detail to its contract rather than suggesting a search or save", () => {
    document.body.innerHTML =
      '<main id="main"><a href="/es/properties/property/edit" hidden>Editar</a><a href="/es/leases/contract">Consultar contrato</a></main>';
    const detail = screenGuidance("/es/properties/property")!;
    const next = chooseGuidance(root(), detail, "entry", new Set());
    expect(next?.target.getAttribute("href")).toBe("/es/leases/contract");
    expect(next?.message).toBe("propertyContract");
    expect(
      chooseGuidance(root(), detail, "task", new Set([next!.id])),
    ).toBeUndefined();
  });
  it("offers receipt recovery in a payment detail without selecting a disabled action", () => {
    document.body.innerHTML =
      '<main id="main"><button data-guide="receipt-download" disabled>Preparando</button><button data-guide="payment-edit">Editar borrador</button></main>';
    const detail = screenGuidance("/es/payments/payment")!;
    expect(chooseGuidance(root(), detail, "entry", new Set())?.message).toBe(
      "paymentEdit",
    );
    root().querySelector("button")?.removeAttribute("disabled");
    expect(chooseGuidance(root(), detail, "task", new Set())?.message).toBe(
      "paymentReceipt",
    );
  });
  it("guides template naming and saving instead of selecting an editor toolbar control", () => {
    document.body.innerHTML =
      '<main id="main"><select><option>Font</option></select><input id="template-editor-name" value="Receipt" /><button data-guide="template-save">Guardar</button></main>';
    const editor = screenGuidance("/pt/templates/editor")!;
    expect(chooseGuidance(root(), editor, "entry", new Set())?.target.id).toBe(
      "template-editor-name",
    );
    expect(chooseGuidance(root(), editor, "entry", new Set())?.message).toBe(
      "templateName",
    );
    expect(chooseGuidance(root(), editor, "task", new Set())?.message).toBe(
      "templateReview",
    );
  });
  it("guides report refresh and the next page using existing enabled controls", () => {
    document.body.innerHTML =
      '<main id="main"><button id="reports-refresh">Actualizar</button><button data-guide="report-next">Siguiente</button></main>';
    const reports = screenGuidance("/es/reports")!;
    expect(chooseGuidance(root(), reports, "entry", new Set())?.target.id).toBe(
      "reports-refresh",
    );
    expect(chooseGuidance(root(), reports, "task", new Set())?.target).toBe(
      root().querySelector('[data-guide="report-next"]'),
    );
    root().querySelector("button[data-guide]")?.setAttribute("disabled", "");
    expect(chooseGuidance(root(), reports, "task", new Set())?.target.id).toBe(
      "reports-refresh",
    );
  });
  it("points to a missing required field with its label and leaves the value untouched", () => {
    const result = chooseGuidance(root(), rule(), "task", new Set());
    expect(result?.target).toBe(input());
    expect(result?.field).toBe("Fecha de inicio");
    expect(input().value).toBe("");
  });
  it("offers the screen entry once, then the review action for a started task", () => {
    input().value = "2026-10-01";
    const entry = chooseGuidance(root(), rule(), "entry", new Set());
    expect(entry?.target.id).toBe("properties-search");
    expect(
      chooseGuidance(root(), rule(), "entry", new Set([entry!.id])),
    ).toBeUndefined();
    expect(chooseGuidance(root(), rule(), "task", new Set())?.target.id).toBe(
      "save",
    );
  });
  it.each(["disabled", "hidden", "inert", "aria-disabled"])(
    "never targets %s controls",
    (attribute) => {
      const element = input();
      element.setAttribute(
        attribute,
        attribute === "aria-disabled" ? "true" : "",
      );
      expect(isAvailableControl(element)).toBe(false);
    },
  );
  it("skips hidden and offscreen controls", () => {
    input().style.display = "none";
    expect(isAvailableControl(input())).toBe(false);
    input().style.display = "block";
    jest
      .spyOn(input(), "getBoundingClientRect")
      .mockReturnValue({ width: 0, height: 0 } as DOMRect);
    expect(isAvailableControl(input())).toBe(false);
  });
  it.each([
    '<p role="alert">Revise el importe</p>',
    '<div aria-busy="true">Cargando</div>',
    "<dialog open>Confirmar</dialog>",
    '<div role="dialog" aria-modal="true">Confirmar</div>',
  ])("gives errors, loading and confirmation priority", (blocker) => {
    root().insertAdjacentHTML("beforeend", blocker);
    expect(guidanceBlocked(root())).toBe(true);
    expect(chooseGuidance(root(), rule(), "entry", new Set())).toBeUndefined();
  });
  it("ignores hidden alerts and fields without readable names", () => {
    root().insertAdjacentHTML(
      "beforeend",
      '<p role="alert" hidden>Error anterior</p>',
    );
    document.querySelector("label")?.remove();
    expect(chooseGuidance(root(), rule(), "task", new Set())?.message).toBe(
      "propertyReview",
    );
  });
});
