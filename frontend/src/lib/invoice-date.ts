/** Date-only database values must not move to the previous day in Argentina. */
export function formatInvoiceDate(
  value: Date | string,
  locale: string,
): string {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return date.toLocaleDateString(locale, {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
