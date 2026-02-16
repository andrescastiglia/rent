const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export function getToken(): string | null {
  if (typeof globalThis.localStorage === "undefined") return null;
  return globalThis.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof globalThis.localStorage === "undefined") return;
  globalThis.localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof globalThis.localStorage === "undefined") return;
  globalThis.localStorage.removeItem(TOKEN_KEY);
}

export function getUser(): Record<string, unknown> | null {
  if (typeof globalThis.localStorage === "undefined") return null;
  const userStr = globalThis.localStorage.getItem(USER_KEY);
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    // Recover from corrupted localStorage value to avoid crashing the app.
    globalThis.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setUser(user: Record<string, unknown>): void {
  if (typeof globalThis.localStorage === "undefined") return;
  globalThis.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeUser(): void {
  if (typeof globalThis.localStorage === "undefined") return;
  globalThis.localStorage.removeItem(USER_KEY);
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
