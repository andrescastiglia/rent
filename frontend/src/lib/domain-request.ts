import { getUser } from "./auth";
import {
  completeDomainAttempt,
  prepareDomainAttempt,
} from "./domain-operation";

const mutableMethods = new Set(["POST", "PATCH", "DELETE"]);
const rejectedStatuses = new Set([400, 401, 403, 404, 409, 422]);

export function needsDomainRecovery(endpoint: string, method: string): boolean {
  return (
    mutableMethods.has(method) &&
    (/^\/(?:properties|owners|tenants|buyers|interested|maintenance)(?:\/|$)/.test(
      endpoint,
    ) ||
      (method === "POST" && endpoint === "/payments") ||
      (method === "PATCH" &&
        /^\/payments\/[^/?]+(?:\/(?:confirm|cancel))?$/.test(endpoint)) ||
      (method === "POST" && endpoint === "/payment-gateway/preferences"))
  );
}

function rejectionStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error))
    return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

/** Same explicit retry retains its key; uncertainty never triggers an automatic send. */
export async function recoverDomainRequest<T>(
  endpoint: string,
  method: string,
  request: unknown,
  execute: (key: string) => Promise<T>,
): Promise<T> {
  const user = getUser();
  if (
    typeof user?.companyId !== "string" ||
    typeof user.id !== "string" ||
    !user.companyId ||
    !user.id
  )
    throw new Error(
      "A authenticated company context is required before changing a record",
    );
  const previous = new Set(
    Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ),
  );
  const attempt = await prepareDomainAttempt(
    `domain-${method.toLowerCase()}`,
    {
      companyId: user.companyId,
      userId: user.id,
      entityId: endpoint.split("?")[0],
    },
    request,
  );
  try {
    const result = await execute(attempt.idempotencyKey);
    completeDomainAttempt(attempt);
    return result;
  } catch (error) {
    const status = rejectionStatus(error);
    if (
      !previous.has(attempt.storageKey) &&
      status !== undefined &&
      rejectedStatuses.has(status)
    )
      completeDomainAttempt(attempt);
    throw error;
  }
}
