import NewTask from '../app/(app)/agenda/new';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { router, useLocalSearchParams } from 'expo-router';
import { agendaApi, type AgendaEntry } from '@/api/agenda';
import { apiClient } from '@/api/client';
import { authApi } from '@/api/auth';
import Agenda from '../app/(app)/agenda/index';
import Detail from '../app/(app)/agenda/[id]';
import Proposals from '../app/(app)/agenda/proposals';
import { AgendaTaskForm } from '@/screens/agenda-task-form';
import { AgendaEntrySettings } from '@/screens/agenda-entry-settings';
import { AgendaCalendarSync } from '@/calendar/agenda-calendar-sync';
import * as calendar from '@/calendar/agenda-calendar';
import { AppState } from 'react-native';
import { cleanup, renderApp, settle, textContent } from './render';
let mockUser: {
  id: string;
  companyId: string;
  role: string;
  roles: string[];
} | null = { id: 'user', companyId: 'company', role: 'admin', roles: [] };
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('@/components/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/components/ui', () => {
  const React = require('react');
  return Object.fromEntries(
    ['AppButton', 'Field', 'DateField', 'ChoiceGroup'].map((name) => [
      name,
      (props: object) => React.createElement(name, props),
    ]),
  );
});
jest.mock('@/components/geo-card', () => ({ GeoCard: () => null }));
jest.mock('@/components/location-picker', () => ({
  LocationPicker: (props: object) =>
    require('react').createElement('LocationPicker', props),
}));
jest.mock('@/calendar/agenda-calendar', () => ({
  calendarState: jest.fn(),
  observeAgendaCalendar: jest.fn(),
  syncAgendaCalendar: jest.fn(),
  disableAgendaCalendar: jest.fn(),
}));
const e = (extra = {}) =>
  ({
    id: 'task:one',
    title: 'Call Ana',
    kind: 'call',
    version: '1:UTC:15:9',
    timezone: 'UTC',
    scheduledDate: '2026-10-03',
    scheduledAt: null,
    endsAt: null,
    status: 'pending',
    personType: null,
    personId: null,
    responsibleUserId: null,
    responsibleName: '',
    reminderMinutes: 15,
    reminderHour: 9,
    editable: true,
    canEdit: true,
    ...extra,
  }) as AgendaEntry;
async function button(app: ReactTestRenderer, title: string) {
  await act(async () => {
    await app.root
      .findAll(
        (n) => (n.type as unknown) === 'AppButton' && n.props.title === title,
      )[0]
      .props.onPress();
  });
  await settle();
}
async function field(app: ReactTestRenderer, label: string, value: string) {
  await act(async () => {
    const n = app.root.findAll(
      (n) => typeof n.type === 'string' && n.props.label === label,
    )[0];
    (n.props.onChangeText ?? n.props.onChange)(value);
  });
  await settle();
}
beforeEach(() => {
  mockUser = { id: 'user', companyId: 'company', role: 'admin', roles: [] };
  jest.spyOn(agendaApi, 'config').mockResolvedValue({
    timezone: 'UTC',
    reminderMinutes: 20,
    reminderHour: 8,
  });
  jest
    .spyOn(agendaApi, 'staff')
    .mockResolvedValue([{ id: 'staff', name: 'Staff' }]);
  jest.spyOn(agendaApi, 'people').mockResolvedValue([
    {
      personType: 'owner',
      personId: 'ana',
      name: 'Ana',
      phone: null,
      email: null,
    },
  ]);
  jest
    .spyOn(agendaApi, 'list')
    .mockResolvedValue({ data: [e()], total: 101, page: 1, limit: 50 });
  jest.spyOn(agendaApi, 'entry').mockResolvedValue(e());
  jest
    .spyOn(agendaApi, 'person')
    .mockResolvedValue({ name: 'Ana', phone: '+54911', email: 'ana@test.com' });
  jest.spyOn(agendaApi, 'create').mockResolvedValue({ id: 'task:new' });
  jest.spyOn(agendaApi, 'update').mockResolvedValue({});
  jest.spyOn(agendaApi, 'settings').mockResolvedValue({});
  (calendar.calendarState as jest.Mock).mockResolvedValue({ lastSync: 'now' });
  (calendar.observeAgendaCalendar as jest.Mock).mockImplementation((_u, cb) => {
    cb({ lastSync: 'now' });
    return jest.fn();
  });
  (calendar.syncAgendaCalendar as jest.Mock).mockResolvedValue({
    lastSync: 'now',
  });
  (calendar.disableAgendaCalendar as jest.Mock).mockResolvedValue(undefined);
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'task:one' });
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
it('creates a person followup once and reuses the key after a lost response', async () => {
  const saved = jest.fn();
  (agendaApi.create as jest.Mock).mockRejectedValueOnce(
    new Error('lost response'),
  );
  const app = await renderApp(
    <AgendaTaskForm
      onSaved={saved}
      personType="owner"
      personId="ana"
      relatedEntryId="task:old"
    />,
  );
  await button(app, 'Guardar');
  expect(textContent(app)).toContain('Ingresá el título');
  await field(app, 'Título', 'Visit');
  await field(app, 'Descripción', 'Details');
  await field(app, 'Tipo', 'visit');
  await act(async () => {
    app.root
      .findByType('LocationPicker' as never)
      .props.onChange({ type: 'property', id: 'place' });
  });
  await field(app, 'Responsable', 'staff');
  await field(app, 'Programación', 'date');
  await button(app, 'Guardar');
  expect(textContent(app)).toContain('Ingresá una fecha válida');
  await field(app, 'Fecha', '2026-10-05');
  await field(app, 'Hora del recordatorio (0 a 23)', '10');
  await field(app, 'Buscar persona', 'Ana');
  await button(app, 'Guardar');
  expect(textContent(app)).toContain('lost response');
  await button(app, 'Guardar');
  expect(saved).toHaveBeenCalledWith('task:new');
  expect((agendaApi.create as jest.Mock).mock.calls[0][1]).toBe(
    (agendaApi.create as jest.Mock).mock.calls[1][1],
  );
  expect(agendaApi.create).toHaveBeenLastCalledWith(
    expect.objectContaining({
      personType: 'owner',
      personId: 'ana',
      locationId: 'place',
      reminderHour: 10,
    }),
    expect.any(String),
  );
});
it('converts timed schedules and preserves linked persons while editing', async () => {
  const app = await renderApp(
    <AgendaTaskForm
      entry={e({
        scheduledDate: null,
        scheduledAt: '2026-10-03T15:00:00Z',
        endsAt: '2026-10-03T16:00:00Z',
        locationType: 'property',
        locationId: 'place',
        responsibleUserId: 'staff',
      })}
      onSaved={jest.fn()}
    />,
  );
  await field(app, 'Fecha y hora (AAAA-MM-DDTHH:mm)', '2026-10-03T17:00');
  await field(app, 'Fin opcional (AAAA-MM-DDTHH:mm)', '2026-10-03T18:00');
  await field(app, 'Recordatorio: minutos antes', '30');
  await button(app, 'Guardar');
  expect(agendaApi.update).toHaveBeenCalledWith(
    'task:one',
    expect.objectContaining({
      version: 1,
      scheduledAt: '2026-10-03T17:00:00.000Z',
      endsAt: '2026-10-03T18:00:00.000Z',
      reminderMinutes: 30,
    }),
    expect.any(String),
  );
  expect((agendaApi.update as jest.Mock).mock.calls[0][1]).not.toHaveProperty(
    'personId',
  );
});
it('creates unscheduled tasks and lets the user select an optional person', async () => {
  const app = await renderApp(<AgendaTaskForm onSaved={jest.fn()} />);
  await field(app, 'Título', 'General');
  await field(app, 'Persona opcional', 'owner:ana');
  await button(app, 'Guardar');
  expect(agendaApi.create).toHaveBeenCalledWith(
    expect.objectContaining({
      scheduledDate: null,
      scheduledAt: null,
      personId: 'ana',
    }),
    expect.any(String),
  );
});
it('shows setup and write errors', async () => {
  (agendaApi.staff as jest.Mock).mockRejectedValue(
    new Error('staff unavailable'),
  );
  const app = await renderApp(<AgendaTaskForm onSaved={jest.fn()} />);
  expect(textContent(app)).toContain('staff unavailable');
  (agendaApi.create as jest.Mock).mockRejectedValue('offline');
  await field(app, 'Título', 'General');
  await button(app, 'Guardar');
  expect(textContent(app)).toContain('No se pudo guardar');
});
it('updates derived reminders and reuses the key on retry', async () => {
  const saved = jest.fn();
  (agendaApi.settings as jest.Mock).mockRejectedValueOnce(
    new Error('lost response'),
  );
  const app = await renderApp(
    <AgendaEntrySettings
      entry={e({ scheduledAt: '2026-10-03T15:00:00Z' })}
      onSaved={saved}
    />,
  );
  await field(app, 'Responsable', 'staff');
  await field(app, 'Minutos antes', '30');
  await field(app, 'Hora del recordatorio', '10');
  await button(app, 'Guardar');
  await button(app, 'Guardar');
  expect(saved).toHaveBeenCalled();
  expect((agendaApi.settings as jest.Mock).mock.calls[0][2]).toBe(
    (agendaApi.settings as jest.Mock).mock.calls[1][2],
  );
});
it.each(['owner', null])(
  'restricts the agenda to internal users (%s)',
  async (role) => {
    mockUser = role ? { ...mockUser!, role } : null;
    const app = await renderApp(<Agenda />);
    expect(textContent(app)).toContain('Agenda reservada');
    expect(agendaApi.list).not.toHaveBeenCalled();
  },
);
it('filters, pages, renders calendar views and synchronizes voluntarily', async () => {
  const app = await renderApp(<Agenda />);
  await field(app, 'Buscar', 'Ana');
  await field(app, 'Tipo', 'call');
  await field(app, 'Estado', 'all');
  await field(app, 'Responsable', 'staff');
  await field(app, 'Persona', 'owner:ana');
  expect(agendaApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({
      search: 'Ana',
      kind: 'call',
      status: 'all',
      responsibleUserId: 'staff',
      personId: 'ana',
    }),
  );
  await button(app, 'Siguiente');
  expect(agendaApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 2 }),
  );
  await button(app, 'Anterior');
  await field(app, 'Vista', 'week');
  await field(app, 'Fecha', '2026-10-03');
  await field(app, 'Vista', 'month');
  await field(app, 'Vista', 'day');
  await button(app, 'Call Ana');
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({ params: { id: 'task:one' } }),
  );
  await button(app, 'Por programar');
  expect(agendaApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ unscheduled: 'true' }),
  );
  await button(app, 'Call Ana');
  await button(app, 'Nueva tarea');
  await button(app, 'Actualizar agenda y calendario');
  await button(app, 'Activar calendario y recordatorios');
  await button(app, 'Desactivar calendario');
  expect(textContent(app)).toContain('Desactivado');
});
it('shows calendar permission errors and query failures', async () => {
  (agendaApi.list as jest.Mock).mockRejectedValue(new Error('agenda offline'));
  (calendar.syncAgendaCalendar as jest.Mock).mockRejectedValue(
    new Error('permission denied'),
  );
  (calendar.disableAgendaCalendar as jest.Mock).mockRejectedValue(
    new Error('disable failed'),
  );
  const app = await renderApp(<Agenda />);
  expect(textContent(app)).toContain('agenda offline');
  await button(app, 'Activar calendario y recordatorios');
  expect(textContent(app)).toContain('permission denied');
  await button(app, 'Actualizar agenda y calendario');
  await button(app, 'Desactivar calendario');
  expect(textContent(app)).toContain('disable failed');
});
it('shows person tasks and completes, cancels, edits and creates followups', async () => {
  (agendaApi.entry as jest.Mock).mockResolvedValue(
    e({ personType: 'owner', personId: 'ana', personName: 'Ana' }),
  );
  const app = await renderApp(<Detail />);
  expect(textContent(app)).toContain('Seguimiento de la persona');
  await button(app, 'Completar');
  expect(agendaApi.update).toHaveBeenCalledWith(
    'task:one',
    { version: 1, status: 'completed' },
    expect.any(String),
  );
  await button(app, 'Cancelar tarea');
  await button(app, 'Editar tarea');
  await button(app, 'Guardar');
  await button(app, 'Crear seguimiento');
  await button(app, 'Call Ana · pending');
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: '/(app)/agenda/new' }),
  );
});
it('shows derived entries and edits settings without altering source status', async () => {
  (agendaApi.entry as jest.Mock).mockResolvedValue(
    e({ editable: false, kind: 'visit' }),
  );
  const app = await renderApp(<Detail />);
  expect(textContent(app)).toContain('módulo de origen');
  await button(app, 'Responsable y recordatorio');
  await button(app, 'Guardar');
  expect(agendaApi.settings).toHaveBeenCalled();
});
it('reports unavailable people and write/calendar failures', async () => {
  (agendaApi.entry as jest.Mock).mockResolvedValue(
    e({ personType: 'owner', personId: 'ana' }),
  );
  (agendaApi.person as jest.Mock).mockResolvedValue(null);
  (agendaApi.update as jest.Mock).mockRejectedValueOnce(
    new Error('write failed'),
  );
  (calendar.syncAgendaCalendar as jest.Mock).mockRejectedValue(
    new Error('calendar failed'),
  );
  const app = await renderApp(<Detail />);
  await settle();
  expect(textContent(app)).toContain('ya no está disponible');
  await button(app, 'Completar');
  expect(textContent(app)).toContain('write failed');
  await button(app, 'Cancelar tarea');
  expect(textContent(app)).toContain('calendar failed');
});
it('reauthenticates approved proposals and rejects others without reauthentication', async () => {
  jest.spyOn(apiClient, 'get').mockResolvedValue([
    {
      id: 'proposal',
      summary: 'Visit',
      status: 'pending',
      payload: { title: 'Visit' },
      requestedByName: 'Ana',
      expiresAt: '2026-10-04',
      canRetry: false,
    },
  ]);
  const post = jest
    .spyOn(apiClient, 'post')
    .mockResolvedValue({ status: 'executed' });
  const reauth = jest
    .spyOn(authApi, 'reauthenticate')
    .mockResolvedValue('reauth-token');
  const app = await renderApp(<Proposals />);
  await field(app, 'Contraseña para reautenticar', 'password');
  await button(app, 'Aprobar');
  expect(reauth).toHaveBeenCalledWith('password');
  expect(post).toHaveBeenCalledWith('/pending-actions/proposal/approve', {
    reauthToken: 'reauth-token',
  });
  await button(app, 'Rechazar');
  expect(post).toHaveBeenLastCalledWith('/pending-actions/proposal/reject', {});
});
it('shows unsuccessful proposals and post-execution calendar failures', async () => {
  jest.spyOn(apiClient, 'get').mockResolvedValue([
    {
      id: 'proposal',
      summary: 'Visit',
      status: 'failed',
      payload: {},
      requestedByName: 'Ana',
      expiresAt: '2026-10-04',
      canRetry: true,
    },
  ]);
  jest.spyOn(authApi, 'reauthenticate').mockResolvedValue('token');
  const post = jest
    .spyOn(apiClient, 'post')
    .mockResolvedValueOnce({
      status: 'failed',
      errorMessage: 'proposal failed',
    })
    .mockResolvedValue({ status: 'executed' });
  const app = await renderApp(<Proposals />);
  await button(app, 'Aprobar');
  expect(textContent(app)).toContain('proposal failed');
  (calendar.syncAgendaCalendar as jest.Mock).mockRejectedValue(
    new Error('calendar failed'),
  );
  await button(app, 'Aprobar');
  expect(textContent(app)).toContain('Propuesta ejecutada. calendar failed');
  post.mockRejectedValue('offline');
  await button(app, 'Rechazar');
  expect(textContent(app)).toContain('No se pudo revisar');
});
it('synchronizes on login and foreground and removes its observer on unmount', async () => {
  const app = await renderApp(<AgendaCalendarSync />);
  expect(calendar.syncAgendaCalendar).toHaveBeenCalledWith(mockUser);
  const handler = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)[1];
  await act(async () => {
    handler('background');
    handler('active');
  });
  await act(async () => app.unmount());
});

it('opens the saved task and synchronizes the calendar after creation', async () => {
  const app = await renderApp(<NewTask />);
  await field(app, 'Título', 'Call');
  await button(app, 'Guardar');
  expect(router.replace).toHaveBeenCalledWith({
    pathname: '/(app)/agenda/[id]',
    params: { id: 'task:new' },
  });
  expect(calendar.syncAgendaCalendar).toHaveBeenCalledWith(mockUser);
});
