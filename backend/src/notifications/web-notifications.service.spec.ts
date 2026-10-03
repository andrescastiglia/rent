import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as webpush from 'web-push';
import { WebNotificationsService } from './web-notifications.service';
import { AgendaService } from '../agenda/agenda.service';
import { AgendaActor } from '../agenda/agenda.dto';
jest.mock('web-push', () => ({ sendNotification: jest.fn() }));
const uuid = '11111111-1111-4111-8111-111111111111';
const actor: AgendaActor = { id: uuid, companyId: uuid, role: 'admin' };
const entry = {
  id: `task:${uuid}`,
  title: 'Call',
  version: '1',
  status: 'pending',
  responsibleUserId: null,
  personId: null,
  personType: null,
  scheduledDate: null,
  scheduledAt: null,
  endsAt: null,
  reminderAt: null,
  timezone: 'UTC',
};
describe('Company web notifications', () => {
  const query = jest.fn();
  const agenda = {
    assertInternal: jest.fn(),
    entry: jest.fn(),
    person: jest.fn(),
    entries: jest.fn(),
  };
  let service: WebNotificationsService;
  const previous = { ...process.env };
  beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValue([]);
    agenda.entry.mockResolvedValue(entry);
    agenda.entries.mockResolvedValue({ data: [] });
    service = new WebNotificationsService(
      {
        query,
        transaction: (fn: (m: unknown) => unknown) => fn({ query }),
      } as unknown as DataSource,
      agenda as unknown as AgendaService,
    );
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  });
  afterAll(() => {
    process.env = previous;
  });
  const enable = () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'public';
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'private';
  };
  const subscription = (endpoint = 'https://fcm.googleapis.com/send/test') => ({
    endpoint,
    keys: { p256dh: 'a'.repeat(40), auth: 'b'.repeat(10) },
  });
  it('reports configuration without private keys', () => {
    expect(service.config()).toEqual({ publicKey: null, enabled: false });
    enable();
    expect(service.config()).toEqual({ publicKey: 'public', enabled: true });
  });
  it('lists only the actor company and user with bounded paging', async () => {
    query
      .mockResolvedValueOnce([{ id: uuid }])
      .mockResolvedValueOnce([{ unread: 2, total: 3 }]);
    expect(await service.list(actor, 2)).toEqual({
      data: [{ id: uuid }],
      unread: 2,
      total: 3,
      page: 2,
    });
    expect(query.mock.calls[0][1]).toEqual([uuid, uuid, 50]);
    for (const p of [0, 1.5, NaN])
      await expect(service.list(actor, p)).rejects.toThrow(BadRequestException);
  });
  it('validates notice IDs and rejects unavailable reads and destinations', async () => {
    await expect(service.read(actor, 'bad')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.destination(actor, 'bad')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.read(actor, uuid)).rejects.toThrow(NotFoundException);
    await expect(service.destination(actor, uuid)).rejects.toThrow(
      NotFoundException,
    );
    query.mockResolvedValue([{ id: uuid }]);
    expect(await service.read(actor, uuid)).toEqual({ id: uuid });
  });
  it('resolves task and person destinations without trusting push URLs', async () => {
    query.mockResolvedValue([{ entry_id: entry.id }]);
    expect((await service.destination(actor, uuid)).path).toBe(
      `/agenda/entries/${encodeURIComponent(entry.id)}`,
    );
    agenda.entry.mockResolvedValue({
      ...entry,
      personType: 'owner',
      personId: uuid,
    });
    agenda.person.mockResolvedValue({ name: 'Ana' });
    expect((await service.destination(actor, uuid)).path).toContain(
      `/agenda/people/owner/${uuid}?entry=`,
    );
  });
  it('restricts proposal destinations to admins or authorized reviewers', async () => {
    query.mockResolvedValue([{ entry_id: `proposal:${uuid}` }]);
    await expect(
      service.destination({ ...actor, role: 'staff' }, uuid),
    ).rejects.toThrow(NotFoundException);
    expect((await service.destination(actor, uuid)).path).toBe(
      `/agenda/proposals/${uuid}`,
    );
    expect(
      (
        await service.destination(
          { ...actor, role: 'staff', permissions: { approvals: true } },
          uuid,
        )
      ).path,
    ).toContain('proposals');
  });
  it('requires configured VAPID and well formed subscriptions', async () => {
    await expect(service.subscribe(actor, subscription())).rejects.toThrow(
      ServiceUnavailableException,
    );
    enable();
    await expect(service.subscribe(actor, {})).rejects.toThrow(
      BadRequestException,
    );
  });
  it.each([
    'http://fcm.googleapis.com/a',
    'https://fcm.googleapis.com:444/a',
    'https://user:pass@fcm.googleapis.com/a',
    'https://127.0.0.1/a',
    'https://fcm.googleapis.com.attacker.test/a',
  ])('rejects SSRF endpoint %s', async (url) => {
    enable();
    await expect(service.subscribe(actor, subscription(url))).rejects.toThrow(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    'https://fcm.googleapis.com/a',
    'https://updates.push.services.mozilla.com/a',
    'https://web.push.apple.com/a',
    'https://wns.notify.windows.com/a',
  ])('registers allowed provider %s', async (url) => {
    enable();
    query.mockResolvedValue([{ id: uuid }]);
    expect(await service.subscribe(actor, subscription(url))).toEqual({
      id: uuid,
    });
    expect(query.mock.calls[0][1]).toEqual([url, uuid, uuid]);
  });
  it('validates unsubscribe and defaults missing preferences to enabled', async () => {
    await expect(
      service.unsubscribe(actor, [] as unknown as string),
    ).rejects.toThrow(BadRequestException);
    await expect(service.unsubscribe(actor, 'a'.repeat(2001))).rejects.toThrow(
      BadRequestException,
    );
    expect(
      await service.unsubscribe(actor, 'https://fcm.googleapis.com/a'),
    ).toEqual({ removed: true });
    query.mockResolvedValue([{ event: 'agenda_assigned', enabled: false }]);
    expect((await service.preferences(actor))[0]).toEqual({
      event: 'assigned',
      enabled: false,
    });
    await expect(
      service.setPreferences(actor, {
        preferences: [{ event: 'unknown', enabled: false }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(
      (
        await service.setPreferences(actor, {
          preferences: [{ event: 'assigned', enabled: false }],
        })
      )[0].enabled,
    ).toBe(false);
  });
  it.each(['assigned', 'rescheduled', 'changed', 'same', 'completed'])(
    'processes %s changes, reminders and overdue notices',
    async (event) => {
      const e = {
        ...entry,
        reminderAt: '2020-01-01T10:00:00Z',
        scheduledDate: '2020-01-01',
        status: event === 'completed' ? 'completed' : 'pending',
      };
      agenda.entries.mockResolvedValue({ data: [e] });
      query.mockImplementation(async (sql: string) => {
        if (sql === 'SELECT id FROM companies WHERE deleted_at IS NULL')
          return [{ id: uuid }];
        if (sql.startsWith('SELECT * FROM agenda_notification_state'))
          return event === 'assigned'
            ? []
            : [
                {
                  version: event === 'same' ? '1' : '0',
                  snapshot: {
                    responsibleUserId: null,
                    scheduledDate:
                      event === 'rescheduled' ? '2019-01-01' : '2020-01-01',
                    scheduledAt: null,
                  },
                },
              ];
        if (sql.startsWith('SELECT CASE'))
          return [{ at: '2020-01-02T00:00:00Z' }];
        return [];
      });
      expect(await service.process()).toMatchObject({
        generated: ['same', 'completed'].includes(event) ? 0 : 1,
        sent: 0,
        failed: 0,
      });
      if (!['same', 'completed'].includes(event))
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO web_notifications'),
          expect.arrayContaining([event]),
        );
    },
  );
  it.each([
    'sent',
    'inactive',
    'stale',
    'assigned-elsewhere',
    'proposal',
    'expired',
    'gone',
    '410',
    '500',
  ])('handles delivery outcome %s', async (outcome) => {
    enable();
    const delivery = {
      id: uuid,
      notice_id: uuid,
      entry_id: ['proposal', 'expired'].includes(outcome)
        ? `proposal:${uuid}`
        : entry.id,
      version: '1',
      company_id: uuid,
      user_id: uuid,
      subscription_id: uuid,
      title: 'Call',
      endpoint: subscription().endpoint,
      p256dh: subscription().keys.p256dh,
      auth: subscription().keys.auth,
    };
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('WITH claimed')) return [delivery];
      if (sql.startsWith('SELECT n.id,u.language'))
        return outcome === 'inactive' ? [] : [{ id: uuid, language: 'en' }];
      if (sql.startsWith('SELECT p.id'))
        return outcome === 'expired' ? [] : [{ id: uuid }];
      return [];
    });
    if (outcome === 'stale')
      agenda.entry.mockResolvedValue({ ...entry, version: '2' });
    if (outcome === 'assigned-elsewhere')
      agenda.entry.mockResolvedValue({ ...entry, responsibleUserId: 'other' });
    if (outcome === 'gone')
      agenda.entry.mockRejectedValue(new NotFoundException());
    if (['410', '500'].includes(outcome))
      (webpush.sendNotification as jest.Mock).mockRejectedValue({
        statusCode: Number(outcome),
      });
    const result = await service.process();
    expect(result.sent).toBe(['sent', 'proposal'].includes(outcome) ? 1 : 0);
    expect(result.failed).toBe(
      ['gone', '410', '500'].includes(outcome) ? 1 : 0,
    );
    if (outcome === '410')
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM web_push_subscriptions WHERE id=$1',
        [uuid],
      );
    if (outcome === '500')
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("status='failed'"),
        expect.any(Array),
      );
    if (outcome === 'sent')
      expect(
        JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1])
          .path,
      ).toBe(`/en/notifications/${uuid}`);
  });
});
