import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { Admin } from '../src/users/entities/admin.entity';
import { UserRole } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createSuperAdminTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Settlement read schema and company boundaries (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  const companyIds: string[] = [];
  const ownerIds: string[] = [];
  const settlementIds: string[] = [];
  let adminToken: string;
  let foreignToken: string;
  let ownerToken: string;
  let tenantToken: string;
  let unlinkedToken: string;
  const unique = randomUUID();
  const password = 'SettlementRead123!';
  const get = (path: string, token = adminToken) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    for (const label of ['local', 'foreign'])
      companyIds.push(
        (
          await createTestCompany(db.getRepository(Company), {
            name: `Settlement ${label}`,
            taxId: `${label}-${unique}`,
          })
        ).id,
      );
    const makeUser = async (
      label: string,
      companyId: string,
      role: UserRole,
    ) => {
      const values = {
        email: `${label}-${unique}@settlement.test`,
        password,
        firstName: 'Settlement',
        lastName: label,
        companyId,
      };
      const user =
        role === UserRole.ADMIN
          ? await createSuperAdminTestUser(
              app.get(UsersService),
              db.getRepository(Admin),
              values,
            )
          : await createActiveTestUser(app.get(UsersService), {
              ...values,
              role,
            });
      return { user, token: await loginTestUser(app, values.email, password) };
    };
    adminToken = (await makeUser('admin', companyIds[0], UserRole.ADMIN)).token;
    foreignToken = (
      await makeUser('foreign-admin', companyIds[1], UserRole.ADMIN)
    ).token;
    for (const [index, label] of [
      'owner',
      'other-owner',
      'foreign-owner',
    ].entries()) {
      const companyId = companyIds[index === 2 ? 1 : 0];
      const { user, token } = await makeUser(label, companyId, UserRole.OWNER);
      if (index === 0) ownerToken = token;
      const [owner] = await db.query(
        'INSERT INTO owners(company_id,user_id,commission_rate) VALUES($1,$2,5) RETURNING id',
        [companyId, user.id],
      );
      ownerIds.push(owner.id);
      const [settlement] = await db.query(
        "INSERT INTO settlements(owner_id,period,gross_amount,commission_amount,net_amount,currency,status,processed_at) VALUES($1,'2026-09',$2,0,$2,'ARS',$3,$4) RETURNING id",
        [
          owner.id,
          index === 0 ? 100 : index === 1 ? 200 : 900,
          index === 1 ? 'completed' : 'pending',
          index === 1 ? '2026-09-01T12:00:00Z' : null,
        ],
      );
      settlementIds.push(settlement.id);
    }
    tenantToken = (await makeUser('tenant', companyIds[0], UserRole.TENANT))
      .token;
    unlinkedToken = (await makeUser('unlinked', companyIds[0], UserRole.OWNER))
      .token;
    for (const [companyId, name, createdAt, deletedAt] of [
      [companyIds[0], 'valid.pdf', '2026-09-01', null],
      [companyIds[1], 'foreign.pdf', '2026-09-02', null],
      [companyIds[0], 'deleted.pdf', '2026-09-03', '2026-09-04'],
      [companyIds[0], 'pending.pdf', '2026-09-05', null],
    ])
      await db.query(
        "INSERT INTO documents(company_id,entity_type,entity_id,document_type,status,name,file_url,created_at,deleted_at) VALUES($1,'owner_settlement',$2,'other','approved',$3,$4,$5,$6)",
        [
          companyId,
          settlementIds[0],
          name,
          `db://document/${name}`,
          createdAt,
          deletedAt,
        ],
      );
    await db.query(
      "UPDATE documents SET status='pending' WHERE company_id=$1 AND name='pending.pdf'",
      [companyIds[0]],
    );
  });
  afterAll(async () => {
    if (db) {
      for (const id of companyIds) {
        await db.query('DELETE FROM documents WHERE company_id=$1', [id]);
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
    }
    await app?.close();
  });
  it('reads real settlement columns and only matching-company active receipt metadata', async () => {
    const response = await get('/settlements').expect(200);
    expect(response.body.map((row: { id: string }) => row.id).sort()).toEqual(
      settlementIds.slice(0, 2).sort(),
    );
    const first = response.body.find(
      (row: { id: string }) => row.id === settlementIds[0],
    );
    expect(first).toMatchObject({
      companyId: companyIds[0],
      ownerId: ownerIds[0],
      currencyCode: 'ARS',
      receiptName: 'valid.pdf',
      receiptPdfUrl: 'db://document/valid.pdf',
      commissionRate: '0.00',
      withholdingsAmount: '0.00',
      netAmount: '100.00',
    });
    const detail = await get(`/settlements/${settlementIds[0]}`).expect(200);
    expect(detail.body).toEqual(first);
  });
  it('filters local owner and status without exposing a foreign owner', async () => {
    const filtered = await get(
      `/settlements?ownerId=${ownerIds[1]}&status=completed`,
    ).expect(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].id).toBe(settlementIds[1]);
    const foreign = await get(`/settlements?ownerId=${ownerIds[2]}`).expect(
      200,
    );
    expect(foreign.body).toEqual([]);
  });
  it('returns 404 for cross-company details in both directions', async () => {
    await get(`/settlements/${settlementIds[2]}`).expect(404);
    await get(`/settlements/${settlementIds[0]}`, foreignToken).expect(404);
  });
  it('forces owners to their linked profile despite requested filters', async () => {
    const list = await get(
      `/settlements?ownerId=${ownerIds[1]}`,
      ownerToken,
    ).expect(200);
    expect(list.body.map((row: { id: string }) => row.id)).toEqual([
      settlementIds[0],
    ]);
    await get(`/settlements/${settlementIds[1]}`, ownerToken).expect(404);
    await get(`/settlements/${settlementIds[2]}`, ownerToken).expect(404);
  });
  it('aggregates only the requested company and authorized owner by currency/status', async () => {
    const summary = await get('/settlements/summary').expect(200);
    expect(summary.body.totals).toEqual(
      expect.arrayContaining([
        {
          currencyCode: 'ARS',
          status: 'pending',
          netAmount: '100.00',
          count: 1,
          lastProcessedAt: null,
        },
        {
          currencyCode: 'ARS',
          status: 'completed',
          netAmount: '200.00',
          count: 1,
          lastProcessedAt: '2026-09-01T12:00:00.000Z',
        },
      ]),
    );
    expect(summary.body.totals).toHaveLength(2);
    const own = await get(
      `/settlements/summary?ownerId=${ownerIds[2]}`,
      ownerToken,
    ).expect(200);
    expect(own.body).toEqual({
      totals: [
        {
          currencyCode: 'ARS',
          status: 'pending',
          netAmount: '100.00',
          count: 1,
          lastProcessedAt: null,
        },
      ],
    });
    const foreign = await get(
      `/settlements/summary?ownerId=${ownerIds[2]}`,
    ).expect(200);
    expect(foreign.body).toEqual({ totals: [] });
  });
  it('separates currencies and all five statuses without losing decimal precision', async () => {
    const inserted: string[] = [];
    try {
      for (const [currency, status, amount] of [
        ['USD', 'pending', '0.10'],
        ['USD', 'pending', '0.20'],
        ['USD', 'processing', '25.99'],
        ['USD', 'failed', '30.01'],
        ['USD', 'cancelled', '40.02'],
        ['USD', 'completed', '50.03'],
      ]) {
        const [row] = await db.query(
          "INSERT INTO settlements(owner_id,period,gross_amount,commission_amount,net_amount,currency,status,scheduled_date) VALUES($1,'2026-10',$2,0,$2,$3,$4,'2099-10-01') RETURNING id",
          [ownerIds[0], amount, currency, status],
        );
        inserted.push(row.id);
      }
      const result = await get('/settlements/summary').expect(200);
      expect(result.body.totals).toHaveLength(7);
      expect(result.body.totals).toEqual(
        expect.arrayContaining([
          {
            currencyCode: 'USD',
            status: 'pending',
            netAmount: '0.30',
            count: 2,
            lastProcessedAt: null,
          },
          {
            currencyCode: 'USD',
            status: 'completed',
            netAmount: '50.03',
            count: 1,
            lastProcessedAt: null,
          },
          {
            currencyCode: 'USD',
            status: 'processing',
            netAmount: '25.99',
            count: 1,
            lastProcessedAt: null,
          },
          {
            currencyCode: 'USD',
            status: 'failed',
            netAmount: '30.01',
            count: 1,
            lastProcessedAt: null,
          },
          {
            currencyCode: 'USD',
            status: 'cancelled',
            netAmount: '40.02',
            count: 1,
            lastProcessedAt: null,
          },
        ]),
      );
      const filters =
        'currency=USD&periodStart=2026-10&periodEnd=2026-10&status=pending';
      const list = await get(`/settlements?${filters}`).expect(200);
      expect(list.body).toHaveLength(2);
      const scoped = await get(`/settlements/summary?${filters}`).expect(200);
      expect(scoped.body.totals).toEqual([
        {
          currencyCode: 'USD',
          status: 'pending',
          netAmount: '0.30',
          count: 2,
          lastProcessedAt: null,
        },
      ]);
      const limited = await get(`/settlements?${filters}&limit=1`).expect(200);
      expect(limited.body).toHaveLength(1);
      expect(limited.body[0].id).toBe(list.body[0].id);
      const excluded = await get(
        '/settlements/summary?currency=USD&periodEnd=2026-09',
      ).expect(200);
      expect(excluded.body.totals).toEqual([]);
    } finally {
      await db.query('DELETE FROM settlements WHERE id=ANY($1::uuid[])', [
        inserted,
      ]);
    }
  });
  it('rejects malformed identifiers, currency, month bounds and list limits', async () => {
    for (const query of [
      'ownerId=invalid',
      'currency=usd',
      'periodStart=2026-13',
      'periodEnd=2026-09-01',
      'periodStart=2026-10&periodEnd=2026-09',
      'status=unknown',
    ]) {
      await get(`/settlements?${query}`).expect(400);
      await get(`/settlements/summary?${query}`).expect(400);
    }
    for (const limit of ['0', '501', '1.5', 'invalid'])
      await get(`/settlements?limit=${limit}`).expect(400);
  });
  it('returns empty scoped data for an owner without a profile', async () => {
    const list = await get('/settlements', unlinkedToken).expect(200);
    expect(list.body).toEqual([]);
    await get(`/settlements/${settlementIds[0]}`, unlinkedToken).expect(404);
    const summary = await get('/settlements/summary', unlinkedToken).expect(
      200,
    );
    expect(summary.body).toEqual({ totals: [] });
  });
  it('rejects unauthenticated and tenant requests', async () => {
    await request(app.getHttpServer()).get('/settlements').expect(401);
    await get('/settlements', tenantToken).expect(403);
    await get(`/settlements/${settlementIds[0]}`, tenantToken).expect(403);
    await get('/settlements/summary', tenantToken).expect(403);
  });
  it('hides soft-deleted owner settlements and receipts', async () => {
    await db.query('UPDATE owners SET deleted_at=now() WHERE id=$1', [
      ownerIds[0],
    ]);
    const list = await get('/settlements').expect(200);
    expect(list.body.map((row: { id: string }) => row.id)).toEqual([
      settlementIds[1],
    ]);
    await get(`/settlements/${settlementIds[0]}`).expect(404);
  });
});
