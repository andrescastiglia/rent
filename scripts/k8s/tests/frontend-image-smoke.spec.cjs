"use strict";

const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { setTimeout: delay } = require("node:timers/promises");

async function main() {
  const backend = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  });
  await new Promise((resolve) => backend.listen(3001, "127.0.0.1", resolve));
  let output = "";
  const server = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      API_PROXY_URL: "http://127.0.0.1:3001",
      NEW_RELIC_ENABLED: "true",
      NEW_RELIC_LICENSE_KEY: "0".repeat(40),
      NEW_RELIC_APP_NAME: "Rent image smoke",
      NEW_RELIC_LOG: "stdout",
      NEW_RELIC_NO_CONFIG_FILE: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) break;
      try {
        const live = await fetch("http://127.0.0.1:3000/health/live", {
          signal: AbortSignal.timeout(2000),
        });
        const ready = await fetch("http://127.0.0.1:3000/health", {
          signal: AbortSignal.timeout(2000),
        });
        if (
          live.ok &&
          ready.ok &&
          (await live.json()).status === "ok" &&
          (await ready.json()).status === "ok"
        ) {
          healthy = true;
          break;
        }
      } catch {
        /* Wait for Next.js and its instrumentation hook to initialize. */
      }
      await delay(1000);
    }
    if (!healthy)
      throw new Error(`Frontend failed instrumented health checks:\n${output}`);
    console.log(
      "Next standalone starts with New Relic and passes live/readiness probes",
    );
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => backend.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
