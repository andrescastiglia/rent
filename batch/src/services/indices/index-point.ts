export function parseIndexPoint(
  date: string,
  value: unknown,
  kind: "level" | "monthly_percent",
) {
  const normalized = /^\d{2}\/\d{2}\/\d{4}$/.test(date)
    ? date.split("/").reverse().join("-")
    : date;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized ||
    !Number.isFinite(number) ||
    (kind === "level" ? number <= 0 : number <= -100)
  )
    throw new Error("Invalid index observation from provider");
  return { date: parsed, value: number };
}
