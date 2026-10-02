export type DomainAttempt = {
  storageKey: string;
  idempotencyKey: string;
  recovered?: boolean;
};
export type DomainScope = {
  companyId: string;
  userId: string;
  entityId: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

/** Only fingerprints and UUIDs are stored, never request content or tokens. */
export async function prepareDomainAttempt(
  namespace: string,
  scope: DomainScope,
  request: unknown,
): Promise<DomainAttempt> {
  if (
    !/^[a-z-]+$/.test(namespace) ||
    !scope.companyId ||
    !scope.userId ||
    !scope.entityId
  )
    throw new Error("A scoped domain operation is required");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical(request))),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const storageKey = `rent:${namespace}:v1:${scope.companyId}:${scope.userId}:${scope.entityId}:${hash}`;
  const allocate = () => {
    const scopePrefix = `rent:${namespace}:v1:${scope.companyId}:${scope.userId}:${scope.entityId}:`;
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(scopePrefix) && key !== storageKey)
        throw new Error(
          "An uncertain operation requires recovery before changing the request",
        );
    }
    const existing = localStorage.getItem(storageKey);
    if (
      existing &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        existing,
      )
    )
      throw new Error("Invalid domain recovery information");
    const idempotencyKey = existing ?? crypto.randomUUID();
    if (!existing) localStorage.setItem(storageKey, idempotencyKey);
    return { storageKey, idempotencyKey, recovered: Boolean(existing) };
  };
  return navigator.locks
    ? navigator.locks.request(
        `rent:${namespace}:v1:${scope.companyId}:${scope.userId}:${scope.entityId}`,
        allocate,
      )
    : allocate();
}

export function completeDomainAttempt(attempt: DomainAttempt): void {
  try {
    if (localStorage.getItem(attempt.storageKey) === attempt.idempotencyKey)
      localStorage.removeItem(attempt.storageKey);
  } catch {
    /* A cleanup error must not turn a successful mutation into a retry. */
  }
}
