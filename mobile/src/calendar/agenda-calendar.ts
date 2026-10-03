import * as Calendar from 'expo-calendar';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { agendaApi, type AgendaEntry } from '@/api/agenda';
import { addDays, civilDateTimeToIso, dayInZone } from '../../../shared/agenda';
export type CalendarScope = { id: string; companyId?: string };
export type CalendarState = {
  enabled: boolean;
  calendarId?: string;
  lastSync?: string;
  events: Record<string, string>;
};
const marker = (s: CalendarScope) => `Rent-${s.companyId}-${s.id}`;
const file = (s: CalendarScope) =>
  new File(Paths.document, `${marker(s)}.json`);
export async function calendarState(
  scope: CalendarScope,
): Promise<CalendarState> {
  const f = file(scope);
  if (!f.exists) return { enabled: false, events: {} };
  const value = JSON.parse(await f.text());
  if (
    !value ||
    typeof value.enabled !== 'boolean' ||
    !value.events ||
    typeof value.events !== 'object'
  )
    throw new Error('Estado del calendario inválido');
  return value;
}
const observers = new Map<string, Set<(state: CalendarState) => void>>();
export function observeAgendaCalendar(
  scope: CalendarScope,
  listener: (state: CalendarState) => void,
) {
  const key = marker(scope),
    listeners = observers.get(key) ?? new Set();
  listeners.add(listener);
  observers.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) observers.delete(key);
  };
}
function save(scope: CalendarScope, state: CalendarState) {
  file(scope).write(JSON.stringify(state));
  for (const listener of observers.get(marker(scope)) ?? []) listener(state);
}
export function calendarEvent(entry: AgendaEntry, userId: string) {
  const date = entry.scheduledDate;
  const allDayStart = (d: string) =>
    Platform.OS === 'android'
      ? `${d}T00:00:00.000Z`
      : civilDateTimeToIso(`${d}T00:00`, entry.timezone);
  const start = date ? allDayStart(date) : entry.scheduledAt!;
  const end = date
    ? allDayStart(addDays(date, 1))
    : (entry.endsAt ?? new Date(Date.parse(start) + 30 * 60000).toISOString());
  const receive =
    entry.responsibleUserId === null || entry.responsibleUserId === userId;
  // All-day alarms use an offset from the civil day's midnight, preserving the company zone.
  const alarmAt = date
    ? civilDateTimeToIso(
        `${date}T${String(entry.reminderHour).padStart(2, '0')}:00`,
        entry.timezone,
      )
    : null;
  const nativeMidnight = date ? new Date(`${date}T00:00:00`).getTime() : 0;
  const alarms: Calendar.Alarm[] = receive
    ? [
        date && Platform.OS === 'ios'
          ? { absoluteDate: alarmAt!, method: Calendar.AlarmMethod.ALERT }
          : {
              relativeOffset: date
                ? Math.round((Date.parse(alarmAt!) - nativeMidnight) / 60000)
                : -entry.reminderMinutes,
              method: Calendar.AlarmMethod.ALERT,
            },
      ]
    : [];
  return {
    title: [entry.title, entry.personName].filter(Boolean).join(' · '),
    startDate: start,
    endDate: end,
    allDay: Boolean(date),
    timeZone: date && Platform.OS === 'android' ? 'UTC' : entry.timezone,
    alarms,
    url: `rent://agenda/${encodeURIComponent(entry.id)}`,
    notes: `Rent-ID:${entry.id}\n${entry.responsibleName ?? 'Sin responsable'}\nEditar y dar seguimiento: rent://agenda/${encodeURIComponent(entry.id)}`,
  };
}
const running = new Map<string, Promise<CalendarState>>();
export async function syncAgendaCalendar(scope: CalendarScope, enable = false) {
  const key = marker(scope);
  const previous = running.get(key);
  if (previous) return previous;
  const promise = sync(scope, enable).finally(() => running.delete(key));
  running.set(key, promise);
  return promise;
}
async function sync(
  scope: CalendarScope,
  enable: boolean,
): Promise<CalendarState> {
  if (Platform.OS === 'web')
    throw new Error('El calendario requiere Android o iOS');
  if (!scope.companyId) throw new Error('Empresa no disponible');
  let state = await calendarState(scope);
  if (!state.enabled && !enable) return state;
  const permission = enable
    ? await Calendar.requestCalendarPermissions()
    : await Calendar.getCalendarPermissions();
  if (!permission.granted)
    throw new Error('Sin permiso para sincronizar el calendario');
  // Obtain every page successfully before changing any native event.
  const config = await agendaApi.config();
  const day = dayInZone(new Date(), config.timezone),
    from = addDays(day, -30),
    to = addDays(day, 366);
  const entries: AgendaEntry[] = [];
  for (let page = 1; ; page++) {
    const result = await agendaApi.list({
      from,
      to,
      status: 'pending',
      page,
      limit: 100,
    });
    if (!result || !Array.isArray(result.data))
      throw new Error('Respuesta incompleta de la agenda');
    entries.push(...result.data);
    if (page * result.limit >= result.total) break;
    if (!result.data.length)
      throw new Error('No se pudo recuperar toda la agenda');
  }
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  let calendar =
    calendars.find(
      (c) => c.id === state.calendarId && c.name === marker(scope),
    ) ?? calendars.find((c) => c.name === marker(scope));
  if (!calendar) {
    calendar = await Calendar.createCalendar({
      title: 'Rent · Empresa',
      name: marker(scope),
      color: '#2563eb',
      entityType: Calendar.EntityTypes.EVENT,
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
      ownerAccount: 'Rent',
      timeZone: config.timezone,
      source:
        Platform.OS === 'ios'
          ? Calendar.getDefaultCalendarSync().source
          : {
              isLocalAccount: true,
              name: 'Rent',
              type: Calendar.SourceType.LOCAL,
            },
    });
    state = { enabled: true, calendarId: calendar.id, events: {} };
    save(scope, state);
  }
  const native = await calendar.listEvents(
    new Date(`${from}T00:00:00.000Z`),
    new Date(`${addDays(to, 1)}T23:59:59Z`),
  );
  const byId = new Map<string, Calendar.ExpoCalendarEvent[]>();
  for (const e of native) {
    const id = e.notes?.match(/^Rent-ID:(.+)$/m)?.[1];
    if (id) {
      const group = byId.get(id) ?? [];
      group.push(e);
      byId.set(id, group);
    }
  }
  const next: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.scheduledAt && !entry.scheduledDate) continue;
    const props = calendarEvent(entry, scope.id);
    const existing = byId.get(entry.id) ?? [];
    let event = existing[0];
    // An external app may move a mapped event outside the scan window.
    if (!event && state.events[entry.id]) {
      try {
        const mapped = await Calendar.ExpoCalendarEvent.get(
          state.events[entry.id],
        );
        if (
          mapped.calendarId === calendar.id &&
          mapped.notes?.split('\n').includes(`Rent-ID:${entry.id}`)
        )
          event = mapped;
      } catch {
        // The external app may also have deleted the event; recreate it below.
      }
    }
    if (event) {
      await event.update(props);
      for (const duplicate of existing.slice(1)) await duplicate.delete();
    } else event = await calendar.createEvent(props);
    if (!event.id)
      throw new Error('El calendario no devolvió el identificador del evento');
    next[entry.id] = event.id;
    state.events[entry.id] = event.id;
    save(scope, { ...state, enabled: true, calendarId: calendar.id });
  }
  for (const [id, list] of byId)
    if (!next[id]) for (const event of list) await event.delete();
  // Previously mapped events can have been moved outside the scan range by another application.
  for (const [id, eventId] of Object.entries(state.events)) {
    if (next[id] || byId.has(id)) continue;
    let event: Calendar.ExpoCalendarEvent;
    try {
      event = await Calendar.ExpoCalendarEvent.get(eventId);
    } catch {
      continue;
    }
    if (
      event.calendarId === calendar.id &&
      event.notes?.includes(`Rent-ID:${id}`)
    )
      await event.delete();
  }
  state = {
    enabled: true,
    calendarId: calendar.id,
    events: next,
    lastSync: new Date().toISOString(),
  };
  save(scope, state);
  return state;
}
export async function disableAgendaCalendar(scope: CalendarScope) {
  const pending = running.get(marker(scope));
  if (pending) await pending.catch(() => undefined);
  const state = await calendarState(scope);
  if (state.calendarId) {
    const permission = await Calendar.getCalendarPermissions();
    if (!permission.granted)
      throw new Error('No se pudo retirar el calendario: falta permiso');
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const c = calendars.find(
      (c) => c.id === state.calendarId && c.name === marker(scope),
    );
    if (c) await c.delete();
  }
  save(scope, { enabled: false, events: {} });
}
