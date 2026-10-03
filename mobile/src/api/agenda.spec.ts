import { agendaApi } from './agenda';
import { apiClient } from './client';
jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
it('encodes filters and task identifiers and passes command keys to mutations', async () => {
  await agendaApi.config();
  await agendaApi.list();
  await agendaApi.list({ search: 'Ana & Juan', page: 2 });
  await agendaApi.entry('task:a/b');
  await agendaApi.people();
  await agendaApi.people('Ana & Juan');
  await agendaApi.person('owner', 'ana');
  await agendaApi.staff();
  await agendaApi.create({ title: 'Call' }, 'key');
  await agendaApi.update('task:one', { title: 'New', version: 1 }, 'key');
  const body = {
    version: '1:UTC',
    responsibleUserId: null,
    reminderMinutes: 15,
    reminderHour: 9,
  };
  await agendaApi.settings('visit:one', body, 'key');
  expect(apiClient.get).toHaveBeenCalledWith(
    '/agenda?search=Ana+%26+Juan&page=2',
  );
  expect(apiClient.get).toHaveBeenCalledWith('/agenda/entries/task%3Aa%2Fb');
  expect(apiClient.patch).toHaveBeenCalledWith(
    '/agenda/entries/visit%3Aone/settings',
    body,
    undefined,
    { 'Idempotency-Key': 'key' },
  );
});
