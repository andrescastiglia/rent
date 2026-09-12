"use strict";

// A session-level database lock also excludes manually dispatched Jobs from
// scheduled runs. Kubernetes CronJob concurrencyPolicy alone cannot do that.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { spawn } = require("node:child_process");
const appRequire = createRequire(resolve(process.cwd(), "package.json"));
const { Client } = appRequire("pg");
const { readFileSync } = require("node:fs");
const [operation, ...args] = process.argv.slice(2);
if (!operation || !/^[a-z-]+$/.test(operation) || args.length === 0) {
  throw new Error("An allowlisted operation and Node command are required");
}
(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL_MODE === "verify-full"
        ? {
            rejectUnauthorized: true,
            ca: readFileSync(process.env.DATABASE_SSL_CA_FILE, "utf8"),
          }
        : undefined,
  });
  let child;
  let failed = false;
  client.on("error", () => {
    failed = true;
    child?.kill("SIGTERM");
  });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      ["rent:operation:" + operation],
    );
    if (!result.rows[0].acquired) {
      console.log("Operation already running; duplicate skipped: " + operation);
      return;
    }
    child = spawn(
      process.execPath,
      ["-r", "/app/deploy/newrelic-bootstrap.cjs", ...args],
      { stdio: "inherit", env: process.env },
    );
    for (const signal of ["SIGTERM", "SIGINT"])
      process.once(signal, () => child.kill(signal));
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(signal ? 1 : code));
    });
    process.exitCode = failed ? 1 : (code ?? 1);
  } finally {
    await client.end();
    if (process.env.RENT_TRACING_MODULE)
      await appRequire(process.env.RENT_TRACING_MODULE).shutdownTracing();
  }
})().catch(() => {
  console.error("Exclusive operation failed");
  process.exitCode = 1;
});
