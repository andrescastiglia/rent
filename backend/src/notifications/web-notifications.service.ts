import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as webpush from 'web-push';
import { z } from 'zod';
import { AgendaService } from '../agenda/agenda.service';
import { AgendaActor, AgendaEntry } from '../agenda/agenda.dto';
const subscriptionSchema = z
  .object({
    endpoint: z.url().max(2000),
    keys: z.object({
      p256dh: z.string().min(40).max(200),
      auth: z.string().min(10).max(100),
    }),
  })
  .strict();
const events = [
  'assigned',
  'rescheduled',
  'changed',
  'reminder',
  'overdue',
  'proposal',
] as const;
const internalRoles = `(CASE WHEN cardinality(u.roles)>0 THEN u.roles ELSE ARRAY[u.role] END)::text[] && ARRAY['admin','staff']`;
@Injectable()
export class WebNotificationsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly agenda: AgendaService,
  ) {}
  config() {
    return {
      publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null,
      enabled: Boolean(
        process.env.WEB_PUSH_VAPID_PUBLIC_KEY &&
        process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
      ),
    };
  }
  async list(actor: AgendaActor, page = 1) {
    this.agenda.assertInternal(actor);
    if (!Number.isInteger(page) || page < 1)
      throw new BadRequestException('Página inválida');
    const data = await this.db.query(
      `SELECT id,title,event,entry_id AS "entryId",read_at AS "readAt",created_at AS "createdAt" FROM web_notifications WHERE company_id=$1 AND user_id=$2 AND cancelled_at IS NULL AND due_at<=now() ORDER BY created_at DESC,id LIMIT 50 OFFSET $3`,
      [actor.companyId, actor.id, (page - 1) * 50],
    );
    const [count] = await this.db.query(
      `SELECT count(*) FILTER(WHERE read_at IS NULL)::int AS unread,count(*)::int AS total FROM web_notifications WHERE company_id=$1 AND user_id=$2 AND cancelled_at IS NULL AND due_at<=now()`,
      [actor.companyId, actor.id],
    );
    return { data, ...count, page };
  }
  async read(actor: AgendaActor, id: string) {
    this.agenda.assertInternal(actor);
    if (!z.uuid().safeParse(id).success)
      throw new BadRequestException('Aviso inválido');
    const rows = await this.db.query(
      `WITH changed AS(UPDATE web_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1::uuid AND company_id=$2 AND user_id=$3 RETURNING id) SELECT id FROM changed`,
      [id, actor.companyId, actor.id],
    );
    if (!rows.length) throw new NotFoundException('Aviso no encontrado');
    return { id };
  }
  async destination(actor: AgendaActor, id: string) {
    this.agenda.assertInternal(actor);
    if (!z.uuid().safeParse(id).success)
      throw new BadRequestException('Aviso inválido');
    const [notice] = await this.db.query(
      'SELECT entry_id FROM web_notifications WHERE id=$1::uuid AND company_id=$2 AND user_id=$3',
      [id, actor.companyId, actor.id],
    );
    if (!notice) throw new NotFoundException('Aviso no encontrado');
    if (notice.entry_id.startsWith('proposal:')) {
      if (
        !(actor.roles?.length ? actor.roles : [actor.role]).includes('admin') &&
        !actor.permissions?.approvals
      )
        throw new NotFoundException('Propuesta no accesible');
      return { path: `/agenda/proposals/${notice.entry_id.slice(9)}` };
    }
    const entry = await this.agenda.entry(actor, notice.entry_id);
    const person =
      entry.personId && entry.personType
        ? await this.agenda.person(actor, entry.personType, entry.personId)
        : null;
    return {
      path: person
        ? `/agenda/people/${entry.personType}/${entry.personId}?entry=${encodeURIComponent(entry.id)}`
        : `/agenda/entries/${encodeURIComponent(entry.id)}`,
    };
  }
  async subscribe(actor: AgendaActor, input: unknown) {
    this.agenda.assertInternal(actor);
    if (!this.config().enabled)
      throw new ServiceUnavailableException('Web Push aún no está configurado');
    const p = subscriptionSchema.safeParse(input);
    if (!p.success) throw new BadRequestException(p.error.issues);
    const url = new URL(p.data.endpoint);
    // Never allow browser-provided endpoints to turn the delivery worker into an SSRF proxy.
    const allowed = [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'web.push.apple.com',
    ];
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      (!allowed.some(
        (host) => url.hostname === host || url.hostname.endsWith('.' + host),
      ) &&
        !/^([a-z0-9-]+\.)*notify\.windows\.com$/.test(url.hostname))
    )
      throw new BadRequestException('Proveedor Push no permitido');
    await this.db.query(
      `DELETE FROM web_push_deliveries WHERE subscription_id IN(SELECT id FROM web_push_subscriptions WHERE endpoint=$1 AND (user_id<>$2 OR company_id<>$3))`,
      [p.data.endpoint, actor.id, actor.companyId],
    );
    const [row] = await this.db.query(
      `INSERT INTO web_push_subscriptions(company_id,user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4,$5) ON CONFLICT(endpoint) DO UPDATE SET company_id=excluded.company_id,user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth RETURNING id`,
      [
        actor.companyId,
        actor.id,
        p.data.endpoint,
        p.data.keys.p256dh,
        p.data.keys.auth,
      ],
    );
    return row;
  }
  async unsubscribe(actor: AgendaActor, endpoint: string) {
    this.agenda.assertInternal(actor);
    if (typeof endpoint !== 'string' || endpoint.length > 2000)
      throw new BadRequestException('Suscripción inválida');
    await this.db.query(
      'DELETE FROM web_push_subscriptions WHERE company_id=$1 AND user_id=$2 AND endpoint=$3',
      [actor.companyId, actor.id, endpoint],
    );
    return { removed: true };
  }
  async preferences(actor: AgendaActor) {
    this.agenda.assertInternal(actor);
    const rows = await this.db.query(
      `SELECT notification_type AS event,is_enabled AS enabled FROM notification_preferences WHERE company_id=$1 AND user_id=$2 AND channel='web'`,
      [actor.companyId, actor.id],
    );
    return events.map((event) => ({
      event,
      enabled:
        rows.find((r: { event: string }) => r.event === `agenda_${event}`)
          ?.enabled ?? true,
    }));
  }
  async setPreferences(actor: AgendaActor, input: unknown) {
    this.agenda.assertInternal(actor);
    const p = z
      .object({
        preferences: z
          .array(
            z.object({ event: z.enum(events), enabled: z.boolean() }).strict(),
          )
          .max(events.length),
      })
      .strict()
      .safeParse(input);
    if (!p.success) throw new BadRequestException(p.error.issues);
    await this.db.transaction(async (m) => {
      for (const item of p.data.preferences)
        await m.query(
          `INSERT INTO notification_preferences(company_id,user_id,notification_type,channel,frequency,is_enabled) VALUES($1,$2,$3::notification_type,'web','immediate',$4) ON CONFLICT(user_id,company_id,notification_type,channel) DO UPDATE SET is_enabled=excluded.is_enabled`,
          [actor.companyId, actor.id, `agenda_${item.event}`, item.enabled],
        );
    });
    return this.preferences(actor);
  }
  private async notice(
    entry: AgendaEntry,
    companyId: string,
    event: string,
    dueAt: Date,
  ) {
    await this.db.transaction(async (m) => {
      await m.query(
        `INSERT INTO web_notifications(company_id,user_id,entry_id,event,version,title,due_at)
 SELECT $1,u.id,$2,$3,$4,$5,$6 FROM users u WHERE u.company_id=$1 AND u.deleted_at IS NULL AND u.is_active AND ${internalRoles}
 AND ($7::uuid IS NULL OR u.id=$7::uuid) AND NOT EXISTS(SELECT 1 FROM notification_preferences p WHERE p.company_id=u.company_id AND p.user_id=u.id AND p.channel='web' AND p.notification_type::text=$8 AND NOT p.is_enabled)
 ON CONFLICT(company_id,user_id,entry_id,event,version) DO NOTHING`,
        [
          companyId,
          entry.id,
          event,
          entry.version,
          entry.title.slice(0, 200),
          dueAt,
          entry.responsibleUserId,
          `agenda_${event}`,
        ],
      );
      await m.query(
        `INSERT INTO web_push_deliveries(notification_id,subscription_id,next_attempt_at)
 SELECT n.id,s.id,n.due_at FROM web_notifications n JOIN web_push_subscriptions s ON s.company_id=n.company_id AND s.user_id=n.user_id
 WHERE n.company_id=$1 AND n.entry_id=$2 AND n.event=$3 AND n.version=$4 AND n.cancelled_at IS NULL ON CONFLICT DO NOTHING`,
        [companyId, entry.id, event, entry.version],
      );
    });
  }
  async process() {
    const companies = await this.db.query(
      'SELECT id FROM companies WHERE deleted_at IS NULL',
    );
    let generated = 0;
    for (const company of companies) {
      const actor: AgendaActor = {
        id: company.id,
        companyId: company.id,
        role: 'admin',
      };
      const { data: entries } = await this.agenda.entries(
        actor,
        { status: 'all' },
        true,
      );
      // Remove notices for sources deleted since the previous pass.
      await this.db.query(
        `UPDATE web_notifications SET cancelled_at=now() WHERE company_id=$1 AND cancelled_at IS NULL AND entry_id NOT LIKE 'proposal:%' AND NOT(entry_id=ANY($2::text[]))`,
        [company.id, entries.map((e) => e.id)],
      );
      for (const e of entries) {
        const [old] = await this.db.query(
          'SELECT * FROM agenda_notification_state WHERE company_id=$1 AND entry_id=$2',
          [company.id, e.id],
        );
        await this.db.query(
          `UPDATE web_notifications SET cancelled_at=now() WHERE company_id=$1 AND entry_id=$2 AND cancelled_at IS NULL AND (version<>$3 OR $4<>'pending')`,
          [company.id, e.id, e.version, e.status],
        );
        if (e.status === 'pending') {
          if (old?.version !== e.version) {
            const event =
              old?.snapshot &&
              old.snapshot.responsibleUserId === e.responsibleUserId
                ? old.snapshot.scheduledDate !== e.scheduledDate ||
                  old.snapshot.scheduledAt !== e.scheduledAt
                  ? 'rescheduled'
                  : 'changed'
                : 'assigned';
            await this.notice(e, company.id, event, new Date());
            generated++;
          }
          if (e.reminderAt)
            await this.notice(
              e,
              company.id,
              'reminder',
              new Date(e.reminderAt),
            );
          const [date] = await this.db.query(
            `SELECT CASE WHEN $1::date IS NOT NULL THEN (($1::date+1)::timestamp AT TIME ZONE $3) ELSE $2::timestamptz END AS at`,
            [e.scheduledDate, e.endsAt ?? e.scheduledAt, e.timezone],
          );
          if (date.at && new Date(date.at) <= new Date())
            await this.notice(e, company.id, 'overdue', new Date(date.at));
        }
        await this.db.query(
          `INSERT INTO agenda_notification_state(company_id,entry_id,version,snapshot) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(company_id,entry_id) DO UPDATE SET version=excluded.version,snapshot=excluded.snapshot`,
          [
            company.id,
            e.id,
            e.version,
            JSON.stringify({
              responsibleUserId: e.responsibleUserId,
              scheduledDate: e.scheduledDate,
              scheduledAt: e.scheduledAt,
            }),
          ],
        );
      }
      await this.proposals(company.id);
    }
    await this.db.query(
      `UPDATE web_push_deliveries d SET status='cancelled' FROM web_notifications n WHERE n.id=d.notification_id AND n.cancelled_at IS NOT NULL AND d.status IN ('queued','failed','processing')`,
    );
    const delivered = await this.deliver();
    return { generated, ...delivered };
  }
  private async proposals(companyId: string) {
    await this.db.query(
      `UPDATE web_notifications n SET cancelled_at=now() WHERE n.company_id=$1 AND n.entry_id LIKE 'proposal:%' AND n.cancelled_at IS NULL AND NOT EXISTS(SELECT 1 FROM pending_actions p WHERE 'proposal:'||p.id=n.entry_id AND p.company_id=n.company_id AND p.status='pending' AND p.expires_at>now())`,
      [companyId],
    );
    await this.db.query(
      `INSERT INTO web_notifications(company_id,user_id,entry_id,event,version,title)
 SELECT p.company_id,u.id,'proposal:'||p.id,'proposal','1',left(p.summary,200) FROM pending_actions p JOIN users u ON u.company_id=p.company_id
 WHERE p.company_id=$1 AND p.status='pending' AND p.expires_at>now() AND u.id<>p.requested_by AND u.deleted_at IS NULL AND u.is_active AND ${internalRoles}
 AND (u.role::text='admin' OR 'admin'=ANY(u.roles::text[]) OR u.permissions->>'approvals'='true')
 AND NOT EXISTS(SELECT 1 FROM notification_preferences pref WHERE pref.company_id=u.company_id AND pref.user_id=u.id AND pref.channel='web' AND pref.notification_type::text='agenda_proposal' AND NOT pref.is_enabled)
 ON CONFLICT DO NOTHING`,
      [companyId],
    );
    await this.db.query(
      `INSERT INTO web_push_deliveries(notification_id,subscription_id) SELECT n.id,s.id FROM web_notifications n JOIN web_push_subscriptions s ON s.company_id=n.company_id AND s.user_id=n.user_id WHERE n.company_id=$1 AND n.event='proposal' AND n.cancelled_at IS NULL ON CONFLICT DO NOTHING`,
      [companyId],
    );
  }
  private async deliver() {
    if (!this.config().enabled) return { sent: 0, failed: 0 };
    let sent = 0,
      failed = 0;
    const claim = randomUUID();
    const deliveries = await this.db.query(
      `WITH claimed AS(UPDATE web_push_deliveries SET status='processing',claim_token=$1,lease_expires_at=now()+interval '2 minutes',attempts=attempts+1 WHERE id IN(SELECT d.id FROM web_push_deliveries d JOIN web_notifications n ON n.id=d.notification_id WHERE n.cancelled_at IS NULL AND n.due_at<=now() AND d.attempts<5 AND ((d.status IN ('queued','failed') AND d.next_attempt_at<=now()) OR (d.status='processing' AND d.lease_expires_at<now())) ORDER BY d.next_attempt_at FOR UPDATE OF d SKIP LOCKED LIMIT 100) RETURNING *) SELECT d.*,n.id AS notice_id,n.title,n.entry_id,n.version,n.company_id,n.user_id,s.endpoint,s.p256dh,s.auth FROM claimed d JOIN web_notifications n ON n.id=d.notification_id JOIN web_push_subscriptions s ON s.id=d.subscription_id AND s.user_id=n.user_id AND s.company_id=n.company_id`,
      [claim],
    );
    for (const d of deliveries) {
      try {
        const [allowed] = await this.db.query(
          `SELECT n.id,u.language FROM web_notifications n JOIN users u ON u.id=n.user_id AND u.company_id=n.company_id WHERE n.id=$1 AND n.cancelled_at IS NULL AND u.is_active AND u.deleted_at IS NULL AND ${internalRoles} AND NOT EXISTS(SELECT 1 FROM notification_preferences p WHERE p.company_id=n.company_id AND p.user_id=n.user_id AND p.channel='web' AND p.notification_type::text='agenda_'||n.event AND NOT p.is_enabled)`,
          [d.notice_id],
        );
        if (!allowed) {
          await this.db.query(
            `UPDATE web_push_deliveries SET status='cancelled' WHERE id=$1 AND claim_token=$2`,
            [d.id, claim],
          );
          continue;
        }
        if (d.entry_id.startsWith('proposal:')) {
          const [proposal] = await this.db.query(
            `SELECT p.id FROM pending_actions p JOIN users u ON u.id=$3 AND u.company_id=p.company_id WHERE p.id=$1 AND p.company_id=$2 AND p.status='pending' AND p.expires_at>now() AND p.requested_by<>u.id AND (u.role::text='admin' OR 'admin'=ANY(u.roles::text[]) OR u.permissions->>'approvals'='true')`,
            [d.entry_id.slice(9), d.company_id, d.user_id],
          );
          if (!proposal) {
            await this.db.query(
              `UPDATE web_push_deliveries SET status='cancelled' WHERE id=$1 AND claim_token=$2`,
              [d.id, claim],
            );
            continue;
          }
        } else {
          const e = await this.agenda.entry(
            { id: d.user_id, companyId: d.company_id, role: 'admin' },
            d.entry_id,
          );
          if (
            e.version !== d.version ||
            e.status !== 'pending' ||
            (e.responsibleUserId && e.responsibleUserId !== d.user_id)
          ) {
            await this.db.query(
              `UPDATE web_push_deliveries SET status='cancelled' WHERE id=$1 AND claim_token=$2`,
              [d.id, claim],
            );
            continue;
          }
        }
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          JSON.stringify({
            id: d.notice_id,
            title: d.title,
            path: `/${['es', 'en', 'pt'].includes(allowed.language) ? allowed.language : 'es'}/notifications/${d.notice_id}`,
            tag: d.notice_id,
          }),
          {
            vapidDetails: {
              subject:
                process.env.WEB_PUSH_VAPID_SUBJECT ??
                'mailto:admin@rent.maese.com.ar',
              publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY!,
              privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,
            },
            TTL: 3600,
            timeout: 10000,
          },
        );
        await this.db.query(
          `UPDATE web_push_deliveries SET status='sent',lease_expires_at=NULL WHERE id=$1 AND claim_token=$2`,
          [d.id, claim],
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (error instanceof NotFoundException) {
          await this.db.query(
            `UPDATE web_push_deliveries SET status='cancelled' WHERE id=$1 AND claim_token=$2`,
            [d.id, claim],
          );
        } else if (status === 404 || status === 410)
          await this.db.query(
            'DELETE FROM web_push_subscriptions WHERE id=$1',
            [d.subscription_id],
          );
        else
          await this.db.query(
            `UPDATE web_push_deliveries SET status='failed',lease_expires_at=NULL,next_attempt_at=now()+make_interval(secs=>LEAST(3600,30*power(2,attempts)::int)) WHERE id=$1 AND claim_token=$2`,
            [d.id, claim],
          );
        failed++;
      }
    }
    return { sent, failed };
  }
}
