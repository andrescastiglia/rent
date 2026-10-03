import {
  chooseGuidance,
  guidanceBlocked,
  screenGuidance,
  type GuidanceSuggestion,
} from "./contextual-guidance";
import pages from "./ai-application-pages.json";

export type AiUiAction = {
  type: "navigate";
  path: string;
  guide: "password" | "screen";
  intent?: "help" | "edit" | "create";
  field?: string;
  instruction?: string;
  recordId?: string;
  openControl?: string;
};
export const ASSISTANT_GUIDANCE_EVENT = "rent:assistant-guidance";
const STORAGE_KEY = "rent:assistant-guidance";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function applicationPage(path: string) {
  const [pathname, search, extra] = path.split("?");
  if (extra !== undefined || path.includes("#")) return undefined;
  if (search !== undefined) {
    const params = new URLSearchParams(search);
    const keys = [...params.keys()];
    if (keys.length !== new Set(keys).size) return undefined;
    const valid =
      pathname === "/templates" || pathname === "/templates/editor"
        ? keys.every((key) =>
            key === "scope"
              ? [
                  "contract_rental",
                  "contract_sale",
                  "receipt",
                  "invoice",
                  "credit_note",
                ].includes(params.get(key) ?? "")
              : key === "templateId" &&
                pathname.endsWith("/editor") &&
                UUID.test(params.get(key) ?? ""),
          )
        : pathname === "/payments/new" &&
          keys.every(
            (key) => key === "leaseId" && UUID.test(params.get(key) ?? ""),
          );
    if (!valid) return undefined;
  }
  const parts = pathname.split("/");
  return pages.find((page) => {
    const pattern = page.path.split("/");
    return (
      pattern.length === parts.length &&
      pattern.every((part, index) =>
        part.startsWith("[") ? UUID.test(parts[index]) : part === parts[index],
      )
    );
  });
}

export function isAiUiAction(value: unknown): value is AiUiAction {
  if (!value || typeof value !== "object") return false;
  const action = value as AiUiAction;
  const page =
    typeof action.path === "string" ? applicationPage(action.path) : undefined;
  return (
    action.type === "navigate" &&
    !!page &&
    (action.intent === undefined ||
      ["help", "edit", "create"].includes(action.intent)) &&
    (action.field === undefined || page.fields.includes(action.field)) &&
    (action.recordId === undefined || UUID.test(action.recordId)) &&
    (action.openControl === undefined ||
      page.openers.includes(action.openControl)) &&
    (action.instruction === undefined ||
      (typeof action.instruction === "string" &&
        action.instruction.length <= 600)) &&
    (action.guide === "screen" ||
      (action.guide === "password" && action.path === "/settings"))
  );
}

export function requestAssistantGuidance(action: AiUiAction): void {
  if (!isAiUiAction(action)) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ action, expiresAt: Date.now() + 60000 }),
    );
  } catch {
    /* The event still works on the current page. */
  }
  window.dispatchEvent(
    new CustomEvent(ASSISTANT_GUIDANCE_EVENT, { detail: action }),
  );
}

export function pendingAssistantGuidance(
  pathname: string,
): AiUiAction | undefined {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      !stored ||
      !Number.isFinite(stored.expiresAt) ||
      stored.expiresAt < Date.now() ||
      !isAiUiAction(stored.action)
    ) {
      sessionStorage.removeItem(STORAGE_KEY);
      return undefined;
    }
    if (
      pathname.replace(/^\/(es|en|pt)(?=\/|$)/, "") ===
      stored.action.path.split("?")[0]
    )
      return stored.action;
  } catch {
    /* Storage is optional. */
  }
  return undefined;
}

export function clearAssistantGuidance(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage is optional. */
  }
}

export function chooseAssistantGuidance(
  root: HTMLElement,
  action: AiUiAction,
): GuidanceSuggestion | undefined {
  if (action.guide === "screen") {
    const available = (element: HTMLElement) => {
      if (
        element.closest('[hidden], [aria-hidden="true"], [inert]') ||
        element.matches(':disabled, input[type="hidden"]')
      )
        return false;
      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getBoundingClientRect().width > 0
      );
    };
    let target = action.field
      ? Array.from(
          root.querySelectorAll<HTMLElement>("[id], [name], [data-guide]"),
        ).find(
          (element) =>
            (element.id === action.field ||
              element.getAttribute("name") === action.field ||
              element.dataset.guide === action.field) &&
            available(element),
        )
      : undefined;
    if (
      target &&
      !target.matches(
        'input, select, textarea, button, a, [contenteditable="true"], [role="combobox"]',
      )
    )
      target =
        target.querySelector<HTMLElement>(
          'input:not([type="hidden"]),select,textarea,[role="combobox"]',
        ) ?? target;
    if (!target && action.field) return undefined;
    if (!target)
      target = Array.from(
        root.querySelectorAll<HTMLElement>(
          "form input[required],form select[required],form textarea[required]",
        ),
      ).find(
        (element) => available(element) && !(element as HTMLInputElement).value,
      );
    if (!target)
      target = Array.from(
        root.querySelectorAll<HTMLElement>(
          'form input:not([type="hidden"]),form select,form textarea',
        ),
      ).find(available);
    if (target)
      return {
        id: `assistant:${action.path}:${action.field ?? target.id ?? "form"}`,
        message: action.intent === "edit" ? "assistantEdit" : "assistantField",
        text: action.instruction,
        field:
          (target as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? "",
        target,
      };
    const rule = screenGuidance(action.path);
    const suggestion = rule
      ? chooseGuidance(root, rule, "entry", new Set())
      : undefined;
    if (suggestion) return { ...suggestion, text: action.instruction };
    target = Array.from(
      root.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]),select,textarea,[data-guide],h1,h2',
      ),
    ).find(available);
    return target
      ? {
          id: `assistant:${action.path}`,
          message: "assistantPage",
          text: action.instruction,
          target,
        }
      : undefined;
  }
  const passwordField = root.querySelector<HTMLInputElement>(
    '[data-guide="password-current"]',
  );
  const passwordForm = passwordField?.closest("form");
  if (!passwordField || guidanceBlocked(passwordForm ?? root)) return undefined;
  const steps = [
    ["password-current", "passwordCurrent"],
    ["password-new", "passwordNew"],
    ["password-confirm", "passwordConfirm"],
  ] as const;
  for (const [marker, message] of steps) {
    const target = root.querySelector<HTMLInputElement>(
      `[data-guide="${marker}"]`,
    );
    const newPassword =
      root.querySelector<HTMLInputElement>('[data-guide="password-new"]')
        ?.value ?? "";
    const incomplete =
      target &&
      (!target.value ||
        (marker === "password-new" && target.value.length < 8) ||
        (marker === "password-confirm" && target.value !== newPassword));
    if (target && !target.disabled && incomplete)
      return { id: marker, message, target };
  }
  const target = root.querySelector<HTMLButtonElement>(
    '[data-guide="password-submit"]',
  );
  return target && !target.disabled
    ? { id: "password-submit", message: "passwordSave", target }
    : undefined;
}

/** Only registered controls may open a local form; never a submit/save. */
export function assistantEditorTrigger(root: HTMLElement, action: AiUiAction) {
  if (!action.intent || action.intent === "help") return undefined;
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>(
      'button[type="button"][data-assistant-intent]',
    ),
  ).find(
    (button) =>
      button.dataset.assistantIntent === action.intent &&
      (action.openControl
        ? button.dataset.assistantOpen === action.openControl
        : !button.dataset.assistantOpen) &&
      !button.disabled &&
      (action.recordId
        ? button.dataset.assistantRecord === action.recordId
        : !button.dataset.assistantRecord),
  );
}
