import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import {
  Property,
  PropertyType,
} from '../src/properties/entities/property.entity';
import { OwnersService } from '../src/owners/owners.service';
import { UsersService } from '../src/users/users.service';
import { UserRole } from '../src/users/entities/user.entity';
import { ProviderHttpService } from '../src/integrations/provider-http.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Owner summary from allocated collections (e2e)', () => {
  let app: INestApplication, db: DataSource, network: jest.SpyInstance;
  const companies: string[] = [];
  const parties: Array<{
    companyId: string;
    ownerId: string;
    userId: string;
    tenantId: string;
    token: string;
    tenantToken: string;
  }> = [];
  let unlinkedToken: string, period: string, date: string;
  const suffix = randomUUID().slice(0, 12),
    password = 'OwnerSummary123!';
  const get = (token = parties[0].token, query = '') =>
    request(app.getHttpServer())
      .get(`/owners/me/summary${query}`)
      .auth(token, { type: 'bearer' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    network = jest
      .spyOn(app.get(ProviderHttpService), 'request')
      .mockRejectedValue(new Error('No provider requests allowed'));
    for (const label of ['local', 'foreign'])
      companies.push(
        (
          await createTestCompany(db.getRepository(Company), {
            name: `Summary ${label}`,
            taxId: `summary-${label}-${suffix}`,
          })
        ).id,
      );
    const user = async (companyId: string, role: UserRole, label: string) => {
      const actor = await createActiveTestUser(app.get(UsersService), {
        companyId,
        role,
        email: `${label}-${suffix}@summary.test`,
        password,
        firstName: 'Summary',
        lastName: label,
      });
      return { actor, token: await loginTestUser(app, actor.email!, password) };
    };
    for (let index = 0; index < 3; index++) {
      const companyId = companies[index === 2 ? 1 : 0];
      const owner = await user(companyId, UserRole.OWNER, `owner-${index}`);
      const tenant = await user(companyId, UserRole.TENANT, `tenant-${index}`);
      const [profile] = await db.query(
        'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
        [companyId, owner.actor.id],
      );
      await db.query(
        'INSERT INTO tenants(company_id,user_id) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM tenants WHERE user_id=$2)',
        [companyId, tenant.actor.id],
      );
      const [tenantProfile] = await db.query(
        'SELECT id FROM tenants WHERE user_id=$1',
        [tenant.actor.id],
      );
      parties.push({
        companyId,
        ownerId: profile.id,
        userId: owner.actor.id,
        tenantId: tenantProfile.id,
        token: owner.token,
        tenantToken: tenant.token,
      });
    }
    unlinkedToken = (await user(companies[0], UserRole.OWNER, 'unlinked'))
      .token;
    const [calendar] = await db.query(
      "SELECT to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM') AS period",
    );
    period = calendar.period;
    date = `${period}-10`;
    await db.query(
      "INSERT INTO currencies(code,name,symbol,decimal_places,is_active) VALUES('USD','US Dollar','US$',2,true) ON CONFLICT DO NOTHING",
    );
  });
  const clear = async () => {
    for (const company of companies) {
      await db.query(
        'DELETE FROM settlements WHERE owner_id IN (SELECT id FROM owners WHERE company_id=$1)',
        [company],
      );
      for (const table of [
        'payment_allocations',
        'payments',
        'invoices',
        'tenant_accounts',
        'leases',
        'properties',
      ])
        await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [company]);
    }
  };
  beforeEach(clear);
  afterEach(() => expect(network).not.toHaveBeenCalled());
  afterAll(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (db) {
      await clear();
      for (const company of companies)
        for (const table of ['tenants', 'owners', 'users', 'companies'])
          await db.query(
            `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}=$1`,
            [company],
          );
    }
    await app?.close();
  });
  const seed = async (
    amount: string,
    currency = 'ARS',
    party = parties[0],
    paymentDate = date,
  ) => {
    const property = await db.getRepository(Property).save({
      companyId: party.companyId,
      ownerId: party.ownerId,
      name: 'Summary property',
      propertyType: PropertyType.APARTMENT,
      addressStreet: 'Test 1',
      addressCity: 'Buenos Aires',
      addressState: 'Buenos Aires',
    });
    const [lease] = await db.query(
      "INSERT INTO leases(company_id,owner_id,tenant_id,property_id,contract_type,status,currency,start_date,end_date,monthly_rent) VALUES($1,$2,$3,$4,'rental','active',$5,'2026-01-01','2027-01-01',100) RETURNING id",
      [party.companyId, party.ownerId, party.tenantId, property.id, currency],
    );
    const [account] = await db.query(
      'INSERT INTO tenant_accounts(company_id,tenant_id,lease_id,currency) VALUES($1,$2,$3,$4) RETURNING id',
      [party.companyId, party.tenantId, lease.id, currency],
    );
    const [invoice] = await db.query(
      "INSERT INTO invoices(company_id,owner_id,lease_id,tenant_account_id,invoice_number,period_start,period_end,due_date,subtotal,total_amount,paid_amount,balance_due,currency,status) VALUES($1,$2,$3,$4,$5,$6,$6,$6,$7,$7,$7,0,$8,'paid') RETURNING id",
      [
        party.companyId,
        party.ownerId,
        lease.id,
        account.id,
        randomUUID(),
        paymentDate,
        amount,
        currency,
      ],
    );
    const [payment] = await db.query(
      "INSERT INTO payments(company_id,tenant_id,tenant_account_id,amount,currency,payment_date,payment_method,status,allocations_recorded) VALUES($1,$2,$3,$4,$5,$6,'cash','completed',true) RETURNING id",
      [
        party.companyId,
        party.tenantId,
        account.id,
        amount,
        currency,
        paymentDate,
      ],
    );
    const [allocation] = await db.query(
      "INSERT INTO payment_allocations(company_id,payment_id,invoice_id,amount,previous_invoice_status) VALUES($1,$2,$3,$4,'pending') RETURNING id",
      [party.companyId, payment.id, invoice.id, amount],
    );
    return {
      leaseId: lease.id,
      accountId: account.id,
      invoiceId: invoice.id,
      paymentId: payment.id,
      allocationId: allocation.id,
      propertyId: property.id,
    };
  };
  it('returns empty scoped counters and the explicit business period', async () => {
    const result = await get().expect(200);
    expect(result.body).toEqual({
      propertiesCount: 0,
      activeLeases: 0,
      pendingSettlements: 0,
      period,
      timeZone: 'America/Argentina/Buenos_Aires',
      collectionsByCurrency: [],
    });
  });
  it('keeps exact amounts separate by currency and counts settlements through the owner', async () => {
    await seed('0.10');
    await seed('0.20');
    await seed('250.99', 'USD');
    await db.query(
      "INSERT INTO settlements(owner_id,period,gross_amount,commission_amount,net_amount,status) VALUES($1,$2,100,0,100,'pending'),($1,$2,100,0,100,'processing'),($1,$2,100,0,100,'completed'),($3,$2,999,0,999,'pending')",
      [parties[0].ownerId, period, parties[1].ownerId],
    );
    const result = await get().expect(200);
    expect(result.body).toMatchObject({
      propertiesCount: 3,
      activeLeases: 3,
      pendingSettlements: 2,
      collectionsByCurrency: [
        { currencyCode: 'ARS', amount: '0.30' },
        { currencyCode: 'USD', amount: '250.99' },
      ],
    });
    expect(result.body).not.toHaveProperty('totalIncomeCurrentMonth');
  });
  it('ignores another owner/company even when query parameters request their scope', async () => {
    await seed('100.01');
    await seed('200.02', 'ARS', parties[1]);
    await seed('900.09', 'ARS', parties[2]);
    for (const [index, amount] of ['100.01', '200.02', '900.09'].entries()) {
      const result = await get(
        parties[index].token,
        `?ownerId=${parties[2].ownerId}&companyId=${companies[1]}`,
      ).expect(200);
      expect(result.body.collectionsByCurrency).toEqual([
        { currencyCode: 'ARS', amount },
      ]);
      expect(result.body.propertiesCount).toBe(1);
    }
    await get(parties[0].tenantToken).expect(403);
    await get(unlinkedToken).expect(404);
    await request(app.getHttpServer()).get('/owners/me/summary').expect(401);
  });
  it('counts allocations rather than unallocated payment balances or duplicate invoice references', async () => {
    const source = await seed('15.25');
    await db.query('UPDATE payments SET amount=100,invoice_id=$2 WHERE id=$1', [
      source.paymentId,
      source.invoiceId,
    ]);
    await db.query(
      "UPDATE invoices SET status='partial',total_amount=100,balance_due=84.75 WHERE id=$1",
      [source.invoiceId],
    );
    const result = await get().expect(200);
    expect(result.body.collectionsByCurrency).toEqual([
      { currencyCode: 'ARS', amount: '15.25' },
    ]);
  });
  it('excludes reversed, cancelled, deleted, unrecorded and mismatched collections', async () => {
    const valid = await seed('12.34');
    for (const scenario of [
      'reversed',
      'cancelled',
      'deleted',
      'unrecorded',
      'currency',
      'account',
      'overallocated',
      'invoice',
    ]) {
      const source = await seed('100');
      if (scenario === 'reversed')
        await db.query(
          'UPDATE payment_allocations SET reversed_at=now() WHERE id=$1',
          [source.allocationId],
        );
      if (scenario === 'cancelled')
        await db.query("UPDATE payments SET status='cancelled' WHERE id=$1", [
          source.paymentId,
        ]);
      if (scenario === 'deleted')
        await db.query('UPDATE payments SET deleted_at=now() WHERE id=$1', [
          source.paymentId,
        ]);
      if (scenario === 'unrecorded')
        await db.query(
          'UPDATE payments SET allocations_recorded=false WHERE id=$1',
          [source.paymentId],
        );
      if (scenario === 'currency')
        await db.query("UPDATE payments SET currency='USD' WHERE id=$1", [
          source.paymentId,
        ]);
      if (scenario === 'account')
        await db.query('UPDATE payments SET tenant_account_id=$2 WHERE id=$1', [
          source.paymentId,
          valid.accountId,
        ]);
      if (scenario === 'overallocated')
        await db.query('UPDATE payments SET amount=1 WHERE id=$1', [
          source.paymentId,
        ]);
      if (scenario === 'invoice')
        await db.query("UPDATE invoices SET status='cancelled' WHERE id=$1", [
          source.invoiceId,
        ]);
    }
    const result = await get().expect(200);
    expect(result.body.collectionsByCurrency).toEqual([
      { currencyCode: 'ARS', amount: '12.34' },
    ]);
  });
  it('retains historical collections after lease finalization and uses payment date rather than invoice period', async () => {
    const source = await seed('77.77');
    await db.query("UPDATE leases SET status='finalized' WHERE id=$1", [
      source.leaseId,
    ]);
    await db.query(
      "UPDATE invoices SET period_start='2020-01-01',period_end='2020-01-31' WHERE id=$1",
      [source.invoiceId],
    );
    const result = await get().expect(200);
    expect(result.body.activeLeases).toBe(0);
    expect(result.body.collectionsByCurrency).toEqual([
      { currencyCode: 'ARS', amount: '77.77' },
    ]);
  });

  it('uses Argentina month boundaries independently of UTC and invoice billing periods', async () => {
    await seed('10.01', 'ARS', parties[0], '2026-09-01');
    await seed('20.02', 'ARS', parties[0], '2026-09-30');
    await seed('40.04', 'ARS', parties[0], '2026-10-01');
    await seed('80.08', 'ARS', parties[0], '2026-08-31');
    jest.useFakeTimers({
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      jest.setSystemTime(new Date('2026-10-01T01:30:00Z'));
      const result = await app
        .get(OwnersService)
        .getOwnerSummary(parties[0].userId, companies[0]);
      expect(result.period).toBe('2026-09');
      expect(result.collectionsByCurrency).toEqual([
        { currencyCode: 'ARS', amount: '30.03' },
      ]);
      jest.setSystemTime(new Date('2026-10-01T03:00:00Z'));
      const october = await app
        .get(OwnersService)
        .getOwnerSummary(parties[0].userId, companies[0]);
      expect(october.period).toBe('2026-10');
      expect(october.collectionsByCurrency).toEqual([
        { currencyCode: 'ARS', amount: '40.04' },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
