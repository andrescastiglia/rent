export type GuidanceStage = "entry" | "task";
export type GuidanceScreen =
  | "dashboard"
  | "properties"
  | "owners"
  | "payments"
  | "leases"
  | "sales"
  | "people"
  | "maintenance"
  | "invoices"
  | "reports"
  | "users"
  | "settings"
  | "templates"
  | "portal";

export type GuidanceRule = {
  screen: GuidanceScreen;
  match: RegExp;
  entrySelector: string;
  taskSelector?: string;
  browseSelector?: string;
  browse?: string;
  actions?: readonly { selector: string; message: string }[];
  entry: string;
  review: string;
};

// Routes and controls are explicit: guidance never selects an arbitrary action.
export const guidanceRules: readonly GuidanceRule[] = [
  {
    screen: "portal",
    match: /^\/portal\//,
    entrySelector:
      ' #buyer-sales-search, [data-guide="review"], a[href*="/payments"], a[href*="/settlements"], a[href*="/contract"], a[href*="/maintenance"], a[href*="/properties"]',
    entry: "portalEntry",
    review: "portalReview",
  },
  {
    screen: "owners",
    match: /^\/(?:owners|properties\/owners)(?:\/|$)/,
    entrySelector:
      '[data-guide="owner-search"], input[type="search"], a[href$="/owners/new"]',
    entry: "ownersEntry",
    review: "peopleReview",
    browseSelector: '[data-guide="owner-open"]',
    browse: "ownerOpen",
  },
  {
    screen: "properties",
    match: /^\/properties(?:\/|$)/,
    entrySelector: "#properties-search",
    entry: "propertiesEntry",
    review: "propertyReview",
    browseSelector: '[data-guide="property-open"]',
    browse: "propertyOpen",
    actions: [
      { selector: 'a[href*="/leases/"]', message: "propertyContract" },
      {
        selector: 'a[href*="/visits/"][href$="/result"]',
        message: "propertyVisitResult",
      },
      { selector: 'a[href$="/visits/new"]', message: "propertyVisitCreate" },
      { selector: 'a[href$="/edit"]', message: "propertyEdit" },
      { selector: 'a[href*="/properties/new"]', message: "propertyCreate" },
    ],
  },
  {
    screen: "payments",
    match: /^\/(?:payments|tenants\/[^/]+\/payments)(?:\/|$)/,
    entrySelector:
      '#payments-search, a[href$="/payments/new"], [data-guide="tenant"]',
    entry: "paymentsEntry",
    review: "paymentReview",
    browseSelector: '[data-guide="payment-open"]',
    browse: "paymentOpen",
    actions: [
      {
        selector: '[data-guide="receipt-download"]',
        message: "paymentReceipt",
      },
      { selector: '[data-guide="payment-edit"]', message: "paymentEdit" },
      { selector: '[data-guide="review"]', message: "paymentReview" },
    ],
  },
  {
    screen: "leases",
    match: /^\/leases(?:\/|$)/,
    entrySelector:
      'input[type="search"], input[placeholder], a[href$="/leases/new"], a[href$="/edit"]',
    entry: "leasesEntry",
    review: "leaseReview",
    browseSelector:
      'a[href*="/leases/"]:not([href$="/new"]):not([href$="/edit"]):not([href$="/import"])',
    browse: "leaseOpen",
    actions: [
      { selector: 'a[href*="/payments/new"]', message: "leasePayment" },
      { selector: 'a[href$="/edit"]', message: "leaseEdit" },
    ],
  },
  {
    screen: "sales",
    match: /^\/sales(?:\/|$)/,
    entrySelector:
      '[data-guide="sale-search"], [data-guide="sale-new"], [data-guide="sale-folder"]',
    entry: "salesEntry",
    review: "saleReview",
    browseSelector: '[data-guide="sale-open"]',
    browse: "saleOpen",
  },
  {
    screen: "people",
    match: /^\/(?:tenants|interested|buyers|staff)(?:\/|$)/,
    entrySelector: 'input[type="search"], input[placeholder], a[href$="/new"]',
    entry: "peopleEntry",
    review: "peopleReview",
    browseSelector: '[data-guide="person-open"]',
    browse: "personOpen",
    actions: [
      { selector: 'a[href$="/activities/new"]', message: "personActivity" },
      { selector: 'a[href$="/edit"]', message: "personEdit" },
      { selector: 'a[href*="/payments/"]', message: "personPayments" },
    ],
  },
  {
    screen: "maintenance",
    match: /^\/maintenance(?:\/|$)/,
    entrySelector:
      'input[type="search"], select, a[href$="/new"], [data-guide="maintenance-new"]',
    entry: "maintenanceEntry",
    review: "maintenanceReview",
    browseSelector: '[data-guide="maintenance-open"]',
    browse: "maintenanceOpen",
  },
  {
    screen: "invoices",
    match: /^\/invoices(?:\/|$)/,
    entrySelector: 'input[type="search"], select, a[href*="/invoices/"]',
    entry: "invoicesEntry",
    review: "invoiceReview",
    browseSelector: '[data-guide="invoice-open"]',
    browse: "invoiceOpen",
  },
  {
    screen: "reports",
    match: /^\/reports(?:\/|$)/,
    entrySelector: "#reports-refresh",
    taskSelector: '[data-guide="report-next"]',
    entry: "reportsEntry",
    review: "reportReview",
  },
  {
    screen: "users",
    match: /^\/users(?:\/|$)/,
    entrySelector: '#users-search, [data-guide="user-new"]',
    entry: "usersEntry",
    review: "userReview",
    browseSelector: '[data-guide="user-open"]',
    browse: "userOpen",
  },
  {
    screen: "settings",
    match: /^\/settings(?:\/|$)/,
    entrySelector:
      'input:not([type="password"]), select, a[href*="/settings/"]',
    entry: "settingsEntry",
    review: "settingsReview",
  },
  {
    screen: "templates",
    match: /^\/templates(?:\/|$)/,
    entrySelector: 'select, input[type="search"], a[href*="/editor"]',
    entry: "templatesEntry",
    review: "templateReview",
    browseSelector: 'a[href*="/templates/editor"]',
    browse: "templateOpen",
    actions: [
      { selector: '[data-guide="template-save"]', message: "templateReview" },
    ],
  },
  {
    screen: "dashboard",
    match: /^\/(?:dashboard|prospect)(?:\/|$)/,
    entrySelector:
      '[data-guide="attention"], a[href*="/payments"], a[href*="/leases"], a[href*="/properties"]',
    entry: "dashboardEntry",
    review: "dashboardReview",
  },
];

export function screenGuidance(pathname: string): GuidanceRule | undefined {
  const path = pathname.replace(/^\/(?:es|en|pt)(?=\/|$)/, "");
  const rule = guidanceRules.find((candidate) => candidate.match.test(path));
  if (rule?.screen === "templates" && path === "/templates/editor")
    return {
      ...rule,
      entrySelector: "#template-editor-name",
      entry: "templateName",
    };
  if (
    rule?.screen === "properties" &&
    /^\/properties\/[^/]+$/.test(path) &&
    !path.endsWith("/new")
  )
    return { ...rule, entrySelector: "" };
  if (
    rule?.screen === "people" &&
    /^\/tenants\/[^/]+$/.test(path) &&
    !path.endsWith("/new")
  )
    return { ...rule, entrySelector: "" };
  if (
    rule?.screen === "payments" &&
    /^\/payments\/[^/]+$/.test(path) &&
    !path.endsWith("/new")
  )
    return { ...rule, entrySelector: "" };
  if (
    rule?.screen === "leases" &&
    /^\/leases\/[^/]+$/.test(path) &&
    !/\/(?:new|import)$/.test(path)
  )
    return { ...rule, entrySelector: "" };
  return rule;
}

export function guidanceDelay(
  value: string | number | undefined,
  fallback: number,
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 300000
    ? parsed
    : fallback;
}

export function isAvailableControl(element: HTMLElement): boolean {
  if (
    element.closest(
      '[inert], [hidden], [aria-hidden="true"], [aria-disabled="true"]',
    )
  )
    return false;
  if (element.matches(":disabled, input[type='hidden']")) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

function firstAvailable(
  root: HTMLElement,
  selector: string,
): HTMLElement | undefined {
  if (!selector) return undefined;
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
    isAvailableControl,
  );
}

export function guidanceBlocked(root: HTMLElement): boolean {
  if (
    document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
  )
    return true;
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '[aria-busy="true"], [data-guide-blocked], [role="alert"], [aria-invalid="true"]',
    ),
  ).some(
    (element) =>
      !element.closest('[hidden], [aria-hidden="true"]') &&
      window.getComputedStyle(element).display !== "none",
  );
}

export type GuidanceSuggestion = {
  id: string;
  message: string;
  field?: string;
  target: HTMLElement;
};

function fieldLabel(element: HTMLElement): string {
  const input = element as HTMLInputElement;
  return (
    input.labels?.[0]?.textContent?.trim() ||
    element.getAttribute("aria-label") ||
    ""
  );
}

export function chooseGuidance(
  root: HTMLElement,
  rule: GuidanceRule,
  stage: GuidanceStage,
  seen: ReadonlySet<string>,
): GuidanceSuggestion | undefined {
  if (guidanceBlocked(root)) return undefined;
  const suggestion = (
    target: HTMLElement | undefined,
    message: string,
    field?: string,
  ): GuidanceSuggestion | undefined => {
    if (!target) return undefined;
    const id = `${rule.screen}:${message}:${target.id || target.getAttribute("name") || target.getAttribute("href") || field || "action"}`;
    return seen.has(id) ? undefined : { id, message, field, target };
  };
  // Required fields are evaluated against the live form, preserving all entered values.
  const pending = Array.from(
    root.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("form input[required], form select[required], form textarea[required]"),
  ).find(
    (field) =>
      isAvailableControl(field) &&
      (field.type === "checkbox"
        ? !(field as HTMLInputElement).checked
        : !field.value.trim()),
  );
  if (pending) {
    const label = fieldLabel(pending);
    if (label) return suggestion(pending, "completeField", label);
  }
  if (stage === "entry") {
    const target = firstAvailable(root, rule.entrySelector);
    if (target) return suggestion(target, rule.entry);
  }
  const task = suggestion(
    firstAvailable(
      root,
      rule.taskSelector ??
        'form button[type="submit"], form input[type="submit"], [data-guide="review"]',
    ),
    rule.review,
  );
  if (task) return task;
  const browse =
    rule.browseSelector && rule.browse
      ? suggestion(firstAvailable(root, rule.browseSelector), rule.browse)
      : undefined;
  if (browse) return browse;
  for (const action of rule.actions ?? []) {
    const next = suggestion(
      firstAvailable(root, action.selector),
      action.message,
    );
    if (next) return next;
  }
  if (rule.taskSelector)
    return suggestion(firstAvailable(root, rule.entrySelector), rule.entry);
  return undefined;
}
