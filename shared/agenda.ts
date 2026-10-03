export interface AgendaEntry {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  personType: string | null;
  personId: string | null;
  personName: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  scheduledDate: string | null;
  scheduledAt: string | null;
  endsAt: string | null;
  reminderMinutes: number;
  reminderHour: number;
  reminderAt: string | null;
  status: string;
  version: string;
  editable: boolean;
  canEdit: boolean;
  sourceType: string | null;
  sourceId: string | null;
  relatedEntryId: string | null;
  timezone: string;
  updatedAt: string;
}
export interface AgendaPerson {
  personType: string;
  personId: string;
  name: string;
  phone: string | null;
  email: string | null;
}
export interface AgendaPage {
  data: AgendaEntry[];
  total: number;
  page: number;
  limit: number;
}
export interface AgendaTaskInput {
  title: string;
  description?: string | null;
  kind?: string;
  personType?: string | null;
  personId?: string | null;
  responsibleUserId?: string | null;
  scheduledDate?: string | null;
  scheduledAt?: string | null;
  endsAt?: string | null;
  reminderMinutes?: number;
  reminderHour?: number;
  status?: string;
  relatedEntryId?: string | null;
}
export interface WebNotice {
  id: string;
  title: string;
  event: string;
  entryId: string;
  readAt: string | null;
  createdAt: string;
}
export const dayInZone = (
  date: Date,
  timezone = "America/Argentina/Buenos_Aires",
) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function isCivilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function addDays(day: string, n: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
export function calendarRange(day: string, view: string) {
  if (view === "list") return null;
  if (view === "day") return { from: day, to: day };
  if (view === "week") {
    const d = new Date(`${day}T12:00:00Z`),
      offset = (d.getUTCDay() + 6) % 7;
    return { from: addDays(day, -offset), to: addDays(day, 6 - offset) };
  }
  const from = `${day.slice(0, 7)}-01`;
  const next = new Date(`${from}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
}
export function entryDay(e: AgendaEntry) {
  return (
    e.scheduledDate ??
    (e.scheduledAt ? dayInZone(new Date(e.scheduledAt), e.timezone) : null)
  );
}
export function civilDateTimeToIso(value: string, timezone: string) {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!parts) throw new Error("Fecha y hora inválidas");
  const target = Date.UTC(
    +parts[1],
    +parts[2] - 1,
    +parts[3],
    +parts[4],
    +parts[5],
  );
  let guess = target;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(
      fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    );
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    const delta = target - local;
    if (!delta) return new Date(guess).toISOString();
    guess += delta;
  }
  throw new Error("Ese horario no existe en la zona de la empresa");
}
