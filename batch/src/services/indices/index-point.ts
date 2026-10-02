export function parseIndexPoint(
  date: string,
  value: unknown,
  kind: "level" | "monthly_percent",
) {
  const normalized = /^\d{2}\/\d{2}\/\d{4}$/.test(date)
    ? date.split("/").reverse().join("-")
    : date;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  let number = Number.NaN;
  if (typeof value === "number") number = value;
  else if (typeof value === "string" && value.trim()) number = Number(value);
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
