/** Contract dates and payment dates describe a calendar day, even in ISO form. */
export function formatCalendarDate(
  value: string | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const day = value?.slice(0, 10);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "—";
  const date = new Date(`${day}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    return "—";
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(date);
}
