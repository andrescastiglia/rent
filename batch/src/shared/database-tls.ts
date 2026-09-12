import { readFileSync } from "node:fs";

/** Explicit TLS policy; undefined retains the legacy deployment behavior. */
export function databaseTls(
  environment: Record<string, string | undefined>,
): { rejectUnauthorized: true; ca: string } | false | undefined {
  const mode = environment.DATABASE_SSL_MODE;
  if (!mode) return undefined;
  if (mode === "disable") return false;
  if (mode !== "verify-full")
    throw new Error("DATABASE_SSL_MODE must be disable or verify-full");
  const caFile = environment.DATABASE_SSL_CA_FILE;
  if (!caFile)
    throw new Error("DATABASE_SSL_CA_FILE is required for verify-full");
  // pg connection-string TLS options override the explicit driver object.
  const url = environment.DATABASE_URL;
  if (
    url &&
    [...new URL(url).searchParams.keys()].some((key) => key.startsWith("ssl"))
  ) {
    throw new Error(
      "Configure database TLS through DATABASE_SSL_MODE, not DATABASE_URL parameters",
    );
  }
  return { rejectUnauthorized: true, ca: readFileSync(caFile, "utf8") };
}
