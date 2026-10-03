import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { agendaApi } from '@/api/agenda';
import {
  calendarEvent,
  calendarState,
  disableAgendaCalendar,
  syncAgendaCalendar,
} from './agenda-calendar';
import type { AgendaEntry } from '@/api/agenda';
const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'local' },
  File: class {
    path: string;
    constructor(_base: string, path: string) {
      this.path = path;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    async text() {
      return mockFiles.get(this.path);
    }
    write(data: string) {
      mockFiles.set(this.path, data);
    }
  },
}));
jest.mock('expo-calendar', () => ({
  AlarmMethod: { ALERT: 'alert' },
  SourceType: { LOCAL: 'local' },
  EntityTypes: { EVENT: 'event' },
  CalendarAccessLevel: { OWNER: 'owner' },
  getCalendarPermissions: jest.fn(),
  requestCalendarPermissions: jest.fn(),
  getCalendars: jest.fn(),
  createCalendar: jest.fn(),
  getDefaultCalendarSync: jest.fn(),
  ExpoCalendarEvent: { get: jest.fn() },
}));
jest.mock('@/api/agenda', () => ({
  agendaApi: { list: jest.fn(), config: jest.fn() },
}));
const scope = { id: 'user', companyId: 'company' },
  marker = 'Rent-company-user';
const entry = (patch: Partial<AgendaEntry> = {}): AgendaEntry => ({
  id: 'task:one',
  title: 'Call',
  description: null,
  kind: 'call',
  personType: null,
  personId: null,
  personName: null,
  responsibleUserId: null,
  responsibleName: null,
  scheduledDate: null,
  scheduledAt: '2026-10-04T13:00:00.000Z',
  endsAt: null,
  reminderMinutes: 15,
  reminderHour: 9,
  reminderAt: '2026-10-04T12:45:00.000Z',
  status: 'pending',
  version: '1:0',
  editable: true,
  canEdit: true,
  sourceType: null,
  sourceId: null,
  relatedEntryId: null,
  timezone: 'America/Argentina/Buenos_Aires',
  updatedAt: '2026-10-03T12:00:00.000Z',
  ...patch,
});
function native(id: string, task = 'task:one') {
  return {
    id,
    calendarId: 'calendar',
    notes: `Rent-ID:${task}`,
    update: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };
}
let calendar: {
  id: string;
  name: string;
  listEvents: jest.Mock;
  createEvent: jest.Mock;
  delete: jest.Mock;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  Platform.OS = 'android';
  calendar = {
    id: 'calendar',
    name: marker,
    listEvents: jest.fn(async () => []),
    createEvent: jest.fn(async () => native('new')),
    delete: jest.fn(async () => undefined),
  };
  jest
    .mocked(Calendar.getCalendarPermissions)
    .mockResolvedValue({ granted: true } as never);
  jest
    .mocked(Calendar.requestCalendarPermissions)
    .mockResolvedValue({ granted: true } as never);
  jest.mocked(Calendar.getCalendars).mockResolvedValue([calendar] as never);
  jest.mocked(Calendar.createCalendar).mockResolvedValue(calendar as never);
  jest.mocked(agendaApi.config).mockResolvedValue({
    timezone: 'America/Argentina/Buenos_Aires',
    reminderMinutes: 15,
    reminderHour: 9,
  });
  jest
    .mocked(agendaApi.list)
    .mockResolvedValue({ data: [entry()], total: 1, page: 1, limit: 100 });
});
describe('native agenda calendar', () => {
  it('only alarms the responsible or everyone when unassigned', () => {
    expect(calendarEvent(entry(), 'user').alarms).toEqual([
      { relativeOffset: -15, method: 'alert' },
    ]);
    expect(
      calendarEvent(entry({ responsibleUserId: 'other' }), 'user').alarms,
    ).toEqual([]);
    expect(
      calendarEvent(entry({ responsibleUserId: 'user' }), 'user').alarms,
    ).toHaveLength(1);
  });
  it('keeps Android date-only events at UTC midnight with the same company reminder instant', () => {
    const date = entry({ scheduledDate: '2026-10-04', scheduledAt: null });
    const event = calendarEvent(date, 'user');
    expect(event.startDate).toBe('2026-10-04T00:00:00.000Z');
    expect(event.endDate).toBe('2026-10-05T00:00:00.000Z');
    expect(event.allDay).toBe(true);
    expect(
      new Date(
        new Date('2026-10-04T00:00:00').getTime() +
          event.alarms[0].relativeOffset! * 60000,
      ).toISOString(),
    ).toBe('2026-10-04T12:00:00.000Z');
  });
  it('uses an absolute iOS alarm in the company zone', () => {
    Platform.OS = 'ios';
    const event = calendarEvent(
      entry({ scheduledDate: '2026-10-04', scheduledAt: null }),
      'user',
    );
    expect(event.startDate).toBe('2026-10-04T03:00:00.000Z');
    expect(event.alarms[0].absoluteDate).toBe('2026-10-04T12:00:00.000Z');
  });
  it('creates once, restores external edits and removes duplicate events', async () => {
    const first = await syncAgendaCalendar(scope, true);
    expect(first.events['task:one']).toBe('new');
    const saved = native('new'),
      duplicate = native('duplicate');
    calendar.listEvents.mockResolvedValue([saved, duplicate]);
    await syncAgendaCalendar(scope);
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
    expect(saved.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call' }),
    );
    expect(duplicate.delete).toHaveBeenCalled();
    expect((await calendarState(scope)).lastSync).toBeDefined();
  });
  it('restores a mapped event moved outside the scan window without creating a duplicate', async () => {
    mockFiles.set(
      `${marker}.json`,
      JSON.stringify({
        enabled: true,
        calendarId: 'calendar',
        events: { 'task:one': 'moved' },
      }),
    );
    const moved = native('moved');
    jest
      .mocked(Calendar.ExpoCalendarEvent.get)
      .mockResolvedValue(moved as never);
    const state = await syncAgendaCalendar(scope);
    expect(moved.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call' }),
    );
    expect(calendar.createEvent).not.toHaveBeenCalled();
    expect(state.events['task:one']).toBe('moved');
  });
  it('retains the previous mirror if any page fails before modifying native events', async () => {
    mockFiles.set(
      `${marker}.json`,
      JSON.stringify({
        enabled: true,
        calendarId: 'calendar',
        lastSync: 'old',
        events: { 'task:one': 'saved' },
      }),
    );
    jest
      .mocked(agendaApi.list)
      .mockResolvedValueOnce({
        data: [entry()],
        total: 101,
        page: 1,
        limit: 100,
      })
      .mockRejectedValueOnce(new Error('offline'));
    await expect(syncAgendaCalendar(scope)).rejects.toThrow('offline');
    expect(calendar.listEvents).not.toHaveBeenCalled();
    expect((await calendarState(scope)).lastSync).toBe('old');
  });
  it('removes completed/cancelled events without touching unrelated calendars or events', async () => {
    mockFiles.set(
      `${marker}.json`,
      JSON.stringify({
        enabled: true,
        calendarId: 'calendar',
        events: { 'task:one': 'saved' },
      }),
    );
    const old = native('saved'),
      unrelated = { ...native('other'), notes: 'Private appointment' };
    calendar.listEvents.mockResolvedValue([old, unrelated]);
    jest
      .mocked(agendaApi.list)
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 100 });
    await syncAgendaCalendar(scope);
    expect(old.delete).toHaveBeenCalled();
    expect(unrelated.delete).not.toHaveBeenCalled();
    expect(calendar.delete).not.toHaveBeenCalled();
  });
  it('requests permission only for explicit opt-in and leaves data intact when denied', async () => {
    await syncAgendaCalendar(scope);
    expect(Calendar.requestCalendarPermissions).not.toHaveBeenCalled();
    jest
      .mocked(Calendar.requestCalendarPermissions)
      .mockResolvedValue({ granted: false } as never);
    await expect(syncAgendaCalendar(scope, true)).rejects.toThrow('permiso');
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });
  it('deletes only its dedicated calendar on opt-out', async () => {
    mockFiles.set(
      `${marker}.json`,
      JSON.stringify({ enabled: true, calendarId: 'calendar', events: {} }),
    );
    await disableAgendaCalendar(scope);
    expect(calendar.delete).toHaveBeenCalled();
    expect((await calendarState(scope)).enabled).toBe(false);
  });
});
