import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { Admin } from '../src/users/entities/admin.entity';
import { UserRole } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';
import { SettlementPayoutsService } from '../src/settlements/settlement-payouts.service';
import { MercadoPagoPayoutsClient } from '../src/integrations/mercadopago-payouts.client';
import { ProviderConfigService } from '../src/integrations/provider-config.service';
import {
  ProviderHttpService,
  ProviderRequestError,
} from '../src/integrations/provider-http.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createSuperAdminTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Durable settlement payouts (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let service: SettlementPayoutsService;
  let companyId: string;
  let foreignId: string;
  let settlementId: string;
  let foreignSettlementId: string;
  let adminId: string;
  let token: string;
  let foreignToken: string;
  let ownerToken: string;
  let enabled = false;
  let create: jest.SpyInstance;
  let transaction: jest.SpyInstance;
  let http: jest.SpyInstance;
  const unique = randomUUID();
  const password = 'PayoutTest123!';
  const dto = {
    confirmed: true,
    expectedAmount: '100.00',
    currency: 'ARS',
    recipientEmail: 'recipient@example.test',
  };
  const url = (id = settlementId) => `/settlements/${id}/payout`;
  const post = (body: object = dto, auth = token, id = settlementId) =>
    request(app.getHttpServer())
      .post(url(id))
      .set('Authorization', `Bearer ${auth}`)
      .send(body);
  const review = (action: string, extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post(`${url()}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        action,
        confirmed: true,
        reason: 'Verified transfer in company account',
        ...extra,
      });
  const worker = () => service.processDue();
  const job = async () =>
    (
      await db.query(
        'SELECT * FROM settlement_payout_outbox WHERE settlement_id=$1',
        [settlementId],
      )
    )[0];
  const settlement = async () =>
    (
      await db.query('SELECT * FROM settlements WHERE id=$1', [settlementId])
    )[0];
  const movements = (): Promise<
    Array<{ id: string; kind: string; amount: string }>
  > =>
    db.query(
      'SELECT * FROM settlement_payout_movements WHERE settlement_id=$1 ORDER BY kind',
      [settlementId],
    );
  const due = () =>
    db.query(
      'UPDATE settlement_payout_outbox SET next_attempt_at=now() WHERE settlement_id=$1',
      [settlementId],
    );
  const remote = (
    status = 'success',
    detail = 'accredited',
    date = '2026-09-01T10:00:00Z',
  ) => ({
    id: `TOP${unique.replaceAll('-', '')}`,
    external_reference: `rent_settlement_${settlementId}`,
    status,
    status_detail: detail,
    last_update_date: date,
    amount: { currency: 'ARS', value: 100 },
  });
  const accepted = () => ({
    id: `POP${unique.replaceAll('-', '')}`,
    external_reference: `rent_settlement_${settlementId}`,
    status: 'created',
    transactions: [
      {
        id: remote().id,
        external_reference: remote().external_reference,
        amount: remote().amount,
      },
    ],
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    service = app.get(SettlementPayoutsService);
    companyId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Payouts',
        taxId: `payouts-${unique}`,
      })
    ).id;
    foreignId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Foreign payouts',
        taxId: `mp-foreign-${unique}`,
      })
    ).id;
    const makeAdmin = async (company: string) => {
      const email = `${company}@payout.test`;
      const user = await createSuperAdminTestUser(
        app.get(UsersService),
        db.getRepository(Admin),
        {
          email,
          password,
          companyId: company,
          firstName: 'Payout',
          lastName: 'Admin',
        },
      );
      return { user, token: await loginTestUser(app, email, password) };
    };
    const admin = await makeAdmin(companyId);
    adminId = admin.user.id;
    token = admin.token;
    const foreign = await makeAdmin(foreignId);
    foreignToken = foreign.token;
    const owner = await createActiveTestUser(app.get(UsersService), {
      email: `owner-${unique}@payout.test`,
      password,
      firstName: 'Payout',
      lastName: 'Owner',
      companyId,
      role: UserRole.OWNER,
    });
    ownerToken = await loginTestUser(app, owner.email!, password);
    for (const [company, userId] of [
      [companyId, owner.id],
      [foreignId, foreign.user.id],
    ]) {
      const [row] = await db.query(
        'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
        [company, userId],
      );
      const [s] = await db.query(
        "INSERT INTO settlements(owner_id,period,gross_amount,net_amount,currency,status) VALUES($1,'2026-09',100,100,'ARS','pending') RETURNING id",
        [row.id],
      );
      if (company === companyId) settlementId = s.id;
      else foreignSettlementId = s.id;
    }
    jest
      .spyOn(app.get(ProviderConfigService), 'enabled')
      .mockImplementation(
        (provider) => provider === 'MERCADOPAGO_PAYOUTS' && enabled,
      );
    create = jest.spyOn(app.get(MercadoPagoPayoutsClient), 'create');
    transaction = jest.spyOn(app.get(MercadoPagoPayoutsClient), 'transaction');
    http = jest
      .spyOn(app.get(ProviderHttpService), 'request')
      .mockRejectedValue(new Error('Live provider calls forbidden in fixture'));
  });
  beforeEach(async () => {
    enabled = true;
    create.mockReset().mockImplementation(async () => accepted());
    transaction.mockReset().mockImplementation(async () => remote());
    http.mockClear();
    await db.query(
      'DELETE FROM settlement_payout_reviews WHERE company_id=$1',
      [companyId],
    );
    await db.query(
      'DELETE FROM settlement_payout_movements WHERE company_id=$1',
      [companyId],
    );
    await db.query('DELETE FROM settlement_payout_outbox WHERE company_id=$1', [
      companyId,
    ]);
    await db.query(
      "UPDATE settlements SET status='pending',net_amount=100,currency='ARS',processed_at=NULL,transfer_reference=NULL WHERE id=$1",
      [settlementId],
    );
  });
  afterEach(() => {
    if (http) expect(http).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    for (const id of [companyId, foreignId].filter(Boolean)) {
      for (const table of [
        'settlement_payout_reviews',
        'settlement_payout_movements',
        'settlement_payout_outbox',
        'documents',
      ])
        await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [id]);
      await db.query(
        'DELETE FROM settlements WHERE owner_id IN (SELECT id FROM owners WHERE company_id=$1)',
        [id],
      );
      for (const table of ['owners', 'admins', 'users', 'companies'])
        await db.query(
          `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}=$1`,
          [id],
        );
    }
    await app?.close();
  });
  it('does not enqueue, scan or invoke providers while disabled, including in test mode', async () => {
    enabled = false;
    await post().expect(503);
    await review('refresh').expect(503);
    const query = jest.spyOn(db, 'query');
    const count = query.mock.calls.length;
    expect(await worker()).toMatchObject({ disabled: true, processed: 0 });
    expect(query.mock.calls.length).toBe(count);
    query.mockRestore();
    expect(await job()).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    const read = await request(app.getHttpServer())
      .get(url())
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(read.body).toMatchObject({
      enabled: false,
      job: null,
      movements: [],
    });
  });
  it('enforces admin authentication and foreign-company boundaries', async () => {
    await post(dto, ownerToken).expect(403);
    await post(dto, foreignToken).expect(404);
    await post(dto, token, foreignSettlementId).expect(404);
    await request(app.getHttpServer()).get(url()).expect(401);
    await request(app.getHttpServer())
      .get(url())
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    expect(await job()).toBeUndefined();
  });
  it('rejects stale amounts, missing confirmation, invalid recipients, non-ARS and already paid settlements', async () => {
    await post({ ...dto, confirmed: false }).expect(400);
    await post({ ...dto, expectedAmount: '99.00' }).expect(409);
    await post({ ...dto, recipientEmail: undefined }).expect(400);
    await post({ ...dto, currency: 'USD' }).expect(400);
    await db.query("UPDATE settlements SET status='completed' WHERE id=$1", [
      settlementId,
    ]);
    await post().expect(409);
    expect(create).not.toHaveBeenCalled();
  });
  it('commits exactly one immutable request for simultaneous confirmations without external I/O', async () => {
    const responses = await Promise.all([post(), post(), post()]);
    expect(responses.map((value) => value.status)).toEqual([201, 201, 201]);
    const row = await job();
    expect(new Set(responses.map((value) => value.body.job.id)).size).toBe(1);
    expect(row.request).toMatchObject({
      amount: '100.00',
      currency: 'ARS',
      idempotencyKey: row.id,
      externalReference: `rent_settlement_${settlementId}`,
    });
    expect(row.requested_by).toBe(adminId);
    expect((await settlement()).status).toBe('processing');
    expect(create).not.toHaveBeenCalled();
    await post({ ...dto, recipientEmail: 'different@example.test' }).expect(
      409,
    );
    await expect(
      db.query(
        "UPDATE settlement_payout_outbox SET request=jsonb_set(request,'{amount}','\"200.00\"') WHERE id=$1",
        [row.id],
      ),
    ).rejects.toThrow('immutable');
  });
  it('claims one send across concurrent workers and records one accredited movement', async () => {
    await post().expect(201);
    await Promise.all([worker(), worker()]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect((await settlement()).status).toBe('completed');
    expect(await movements()).toHaveLength(1);
    await due();
    await worker();
    expect(create).toHaveBeenCalledTimes(1);
    expect(await movements()).toHaveLength(1);
  });
  it('does not pay on accepted or in-progress responses and reconciles by saved IDs', async () => {
    transaction.mockResolvedValueOnce(remote('success', 'in_progress'));
    await post().expect(201);
    await worker();
    expect((await job()).status).toBe('awaiting');
    expect((await settlement()).status).toBe('processing');
    expect(await movements()).toHaveLength(0);
    await due();
    transaction.mockResolvedValue(
      remote('success', 'accredited', '2026-09-01T11:00:00Z'),
    );
    await worker();
    expect((await settlement()).status).toBe('completed');
    expect(await movements()).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('never resends an uncertain creation and can link a verified existing transaction', async () => {
    create.mockRejectedValue(
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', true),
    );
    await post().expect(201);
    await worker();
    expect((await job()).status).toBe('needs_review');
    await due();
    await worker();
    expect(create).toHaveBeenCalledTimes(1);
    await review('retry').expect(409);
    await review('link', {
      payoutId: accepted().id,
      transactionId: remote().id,
    }).expect(201);
    expect(transaction).toHaveBeenCalledWith(
      companyId,
      accepted().id,
      remote().id,
      (await job()).request,
    );
    await worker();
    expect((await settlement()).status).toBe('completed');
    expect(create).toHaveBeenCalledTimes(1);
    expect(await movements()).toHaveLength(1);
    expect(
      await db.query(
        'SELECT * FROM settlement_payout_reviews WHERE company_id=$1',
        [companyId],
      ),
    ).toHaveLength(1);
  });
  it('permits an explicit retry only after a definitive rejection using the same request and key', async () => {
    create.mockRejectedValueOnce(
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', false, 400),
    );
    await post().expect(201);
    const original = (await job()).request;
    await worker();
    expect((await job()).error_code).toBe('provider_rejected');
    expect((await settlement()).status).toBe('failed');
    await review('retry', { reason: ' ' }).expect(400);
    await review('retry').expect(201);
    await worker();
    expect(create).toHaveBeenNthCalledWith(1, companyId, original);
    expect(create).toHaveBeenNthCalledWith(2, companyId, original);
    expect(await movements()).toHaveLength(1);
  });
  it('does not treat idempotency conflicts as proof that no transfer exists', async () => {
    create.mockRejectedValueOnce(
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', false, 409),
    );
    await post().expect(201);
    await worker();
    expect((await job()).status).toBe('needs_review');
    await review('retry').expect(409);
  });
  it('can recover local missing configuration only through explicit review', async () => {
    create.mockRejectedValueOnce(
      new ServiceUnavailableException('No account configured'),
    );
    await post().expect(201);
    await worker();
    expect((await job()).error_code).toBe('configuration_error');
    expect(await movements()).toHaveLength(0);
    await review('retry').expect(201);
    await worker();
    expect((await settlement()).status).toBe('completed');
  });
  it('persists accepted IDs before retrying failed reads and bounds read failures', async () => {
    transaction.mockRejectedValue(
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', false, 503),
    );
    await post().expect(201);
    for (let i = 0; i < 5; i++) {
      await due();
      await worker();
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(5);
    expect((await job()).status).toBe('needs_review');
    expect((await job()).payout_id).toBe(accepted().id);
    expect(await movements()).toHaveLength(0);
    transaction.mockResolvedValue(remote());
    await review('refresh').expect(201);
    await worker();
    expect((await settlement()).status).toBe('completed');
  });
  it('records a full refund exactly once without creating a new payout', async () => {
    await post().expect(201);
    await worker();
    await due();
    transaction.mockResolvedValue(
      remote('refunded', 'refunded', '2026-09-02T10:00:00Z'),
    );
    await worker();
    expect((await job()).status).toBe('reversed');
    expect((await settlement()).status).toBe('failed');
    expect((await movements()).map((value) => value.kind)).toEqual([
      'reversal',
      'transfer',
    ]);
    await review('refresh').expect(201);
    await worker();
    expect(await movements()).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('ignores old provider observations and rejects contradictory observations with equal timestamps', async () => {
    await post().expect(201);
    await worker();
    await due();
    transaction.mockResolvedValue(
      remote('success', 'in_progress', '2026-08-01T10:00:00Z'),
    );
    await worker();
    expect((await settlement()).status).toBe('completed');
    expect((await job()).remote_status).toBe('success');
    await due();
    transaction.mockResolvedValue(remote('refunded', 'refunded'));
    await worker();
    expect((await job()).error_code).toBe('conflicting_provider_status');
    expect(await movements()).toHaveLength(1);
  });
  it('requires review for partial refunds without inventing an amount to reverse', async () => {
    await post().expect(201);
    await worker();
    await due();
    transaction.mockResolvedValue(
      remote('approved', 'partially_refunded', '2026-09-02T10:00:00Z'),
    );
    await worker();
    expect((await job()).status).toBe('needs_review');
    expect((await settlement()).status).toBe('processing');
    expect(await movements()).toHaveLength(1);
  });
  it('rejects changed settlement snapshots before sending', async () => {
    await post().expect(201);
    await db.query('UPDATE settlements SET net_amount=200 WHERE id=$1', [
      settlementId,
    ]);
    await worker();
    expect(create).not.toHaveBeenCalled();
    expect(await movements()).toHaveLength(0);
    await review('retry').expect(409);
  });
  it('fences a late creation response after another worker recovers an expired lease', async () => {
    let release!: (value: ReturnType<typeof accepted>) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    create.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    await post().expect(201);
    const first = worker();
    await entered;
    await db.query(
      "UPDATE settlement_payout_outbox SET lease_expires_at=now()-interval '1 second' WHERE settlement_id=$1",
      [settlementId],
    );
    await worker();
    release(accepted());
    await first;
    expect(create).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    expect((await job()).status).toBe('needs_review');
    expect(await movements()).toHaveLength(0);
  });
  it('requires a configured internal batch credential and checks it before processing', async () => {
    const previous = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    try {
      delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
      await request(app.getHttpServer())
        .post('/settlements/internal/process-payouts')
        .expect(503);
      process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'payout-test-batch';
      await request(app.getHttpServer())
        .post('/settlements/internal/process-payouts')
        .expect(401);
      enabled = false;
      const response = await request(app.getHttpServer())
        .post('/settlements/internal/process-payouts')
        .set('x-batch-communications-token', 'payout-test-batch')
        .expect(201);
      expect(response.body.disabled).toBe(true);
    } finally {
      if (previous === undefined)
        delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
      else process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = previous;
    }
  });
  it('rolls back the movement and completion together when the settlement update fails', async () => {
    await post().expect(201);
    await db.query(
      `CREATE FUNCTION payout_test_reject_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${settlementId}'::uuid AND NEW.status='completed' THEN RAISE EXCEPTION 'fixture settlement write failure'; END IF; RETURN NEW; END; $$`,
    );
    await db.query(
      'CREATE TRIGGER payout_test_reject_complete BEFORE UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION payout_test_reject_complete()',
    );
    try {
      await worker();
      expect(await movements()).toHaveLength(0);
      expect((await settlement()).status).toBe('processing');
      expect((await job()).status).toBe('awaiting');
    } finally {
      await db.query('DROP TRIGGER payout_test_reject_complete ON settlements');
      await db.query('DROP FUNCTION payout_test_reject_complete()');
    }
    await due();
    await worker();
    expect(await movements()).toHaveLength(1);
    expect((await settlement()).status).toBe('completed');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['rejected', 'by_bank', 'failed'],
    ['canceled', 'canceled', 'failed'],
    ['error', 'failed', 'failed'],
    ['mystery', 'unknown', 'needs_review'],
    ['approved', 'partially_refunded', 'needs_review'],
    ['refunded', 'refunded', 'reversed'],
  ])('does not record payment for %s/%s', async (status, detail, expected) => {
    transaction.mockResolvedValue(remote(status, detail));
    await post().expect(201);
    await worker();
    expect((await job()).status).toBe(expected);
    expect(await movements()).toHaveLength(0);
    expect((await settlement()).status).not.toBe('completed');
  });
  it('never reaccredits a refunded transaction', async () => {
    await post().expect(201);
    await worker();
    await due();
    transaction.mockResolvedValue(
      remote('refunded', 'refunded', '2026-09-02T10:00:00Z'),
    );
    await worker();
    transaction.mockResolvedValue(
      remote('success', 'accredited', '2026-09-03T10:00:00Z'),
    );
    await review('refresh').expect(201);
    await worker();
    expect((await job()).error_code).toBe('accreditation_after_reversal');
    expect((await settlement()).status).toBe('failed');
    expect(await movements()).toHaveLength(2);
  });
  it('serializes competing links and records one review without sending funds', async () => {
    create.mockRejectedValue(
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', true),
    );
    await post().expect(201);
    await worker();
    const results = await Promise.all([
      review('link', { payoutId: accepted().id, transactionId: remote().id }),
      review('link', { payoutId: accepted().id, transactionId: remote().id }),
    ]);
    expect(results.map((value) => value.status).sort()).toEqual([201, 409]);
    expect(await movements()).toHaveLength(0);
    expect(
      await db.query(
        'SELECT * FROM settlement_payout_reviews WHERE company_id=$1',
        [companyId],
      ),
    ).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('does not accept a new link without successful provider verification', async () => {
    create.mockRejectedValue(
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', true),
    );
    await post().expect(201);
    await worker();
    transaction.mockRejectedValue(
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', false, 403),
    );
    await review('link', {
      payoutId: accepted().id,
      transactionId: remote().id,
    }).expect(500);
    expect((await job()).payout_id).toBeNull();
    expect(await movements()).toHaveLength(0);
  });
});
