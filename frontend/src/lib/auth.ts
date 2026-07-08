const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const USER_ROLES = new Set(["admin", "owner", "tenant", "staff", "buyer"]);
const USER_LANGUAGES = new Set(["es", "en", "pt"]);
let inMemoryUser: Record<string, unknown> | null = null;

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sanitizeUserForStorage(
  user: Record<string, unknown>,
): Record<string, unknown> {
  const role = getOptionalString(user.role);
  const language = getOptionalString(user.language);

  return {
    id: getOptionalString(user.id) ?? "",
    email: null,
    firstName: getOptionalString(user.firstName) ?? "",
    lastName: getOptionalString(user.lastName) ?? "",
    avatarUrl: getOptionalString(user.avatarUrl) ?? null,
    language: language && USER_LANGUAGES.has(language) ? language : undefined,
    role: role && USER_ROLES.has(role) ? role : "staff",
    isActive: typeof user.isActive === "boolean" ? user.isActive : undefined,
  };
}

export function getToken(): string | null {
  if (globalThis.localStorage == null) return null;
  return globalThis.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (globalThis.localStorage == null) return;
  globalThis.localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  if (globalThis.localStorage == null) return;
  globalThis.localStorage.removeItem(TOKEN_KEY);
}

export function getUser(): Record<string, unknown> | null {
  if (globalThis.localStorage != null) {
    // Remove legacy persisted profiles; only the token is durable now.
    globalThis.localStorage.removeItem(USER_KEY);
  }
  return inMemoryUser;
}

export function setUser(user: Record<string, unknown>): void {
  inMemoryUser = sanitizeUserForStorage(user);
  if (globalThis.localStorage != null) {
    globalThis.localStorage.removeItem(USER_KEY);
  }
}

export function removeUser(): void {
  inMemoryUser = null;
  if (globalThis.localStorage != null) {
    globalThis.localStorage.removeItem(USER_KEY);
  }
}

function base64UrlDecode(input: string): string {
  // Convert base64url -> base64
  const base64 = input.replaceAll("-", "+").replaceAll("_", "/");
  // Pad with '='
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  return atob(padded);
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const expSeconds = payload?.exp;

    // If token has no exp, treat it as expired/invalid.
    if (typeof expSeconds !== "number" || !Number.isFinite(expSeconds))
      return true;

    const expMs = expSeconds * 1000;
    return Date.now() >= expMs;
  } catch {
    return true;
  }
}

export function clearAuth(): void {
  removeToken();
  removeUser();
}
