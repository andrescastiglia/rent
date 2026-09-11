export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEW_RELIC_LICENSE_KEY &&
    process.env.NEW_RELIC_ENABLED !== "false"
  ) {
    await import("newrelic");
  }
}
