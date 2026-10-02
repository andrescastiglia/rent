import { randomUUID } from 'node:crypto';
import { ProviderConfigService } from '../src/integrations/provider-config.service';
import { MercadoPagoPayoutsClient } from '../src/integrations/mercadopago-payouts.client';
import { SettlementPayoutsService } from '../src/settlements/settlement-payouts.service';
import { SettlementCalculationService } from '../src/settlements/settlement-calculation.service';
import { INestApplication } from '@nestjs/common';
import { ProviderHttpService } from '../src/integrations/provider-http.service';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { Currency } from '../src/currencies/entities/currency.entity';
import {
  ContractType,
  Lease,
  LeaseStatus,
  PaymentFrequency,
} from '../src/leases/entities/lease.entity';
import { Owner } from '../src/owners/entities/owner.entity';
import {
  Property,
  PropertyType,
} from '../src/properties/entities/property.entity';
import { Tenant } from '../src/tenants/entities/tenant.entity';
import { Admin } from '../src/users/entities/admin.entity';
import { UserRole } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';
import {
  Invoice,
  InvoiceStatus,
} from '../src/payments/entities/invoice.entity';
import { TenantAccount } from '../src/payments/entities/tenant-account.entity';
import {
  configureE2eApp,
  createActiveTestUser,
  createSuperAdminTestUser,
  createTestCompany,
  loginTestUser,
  purgeFinancialCorrections,
} from './e2e-helpers';

describe('Settlement calculation from recorded collections (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let companyRepository: Repository<Company>;
  let currencyRepository: Repository<Currency>;
  let adminRepository: Repository<Admin>;
  let ownerRepository: Repository<Owner>;
  let tenantRepository: Repository<Tenant>;
  let propertyRepository: Repository<Property>;
  let leaseRepository: Repository<Lease>;
  let tenantAccountRepository: Repository<TenantAccount>;
  let invoiceRepository: Repository<Invoice>;
  let usersService: UsersService;
  let companyId: string;
  let adminToken: string;
  let tenantAccountId: string;
  let invoiceId: string;
  let ownerId: string;
  let foreignCompanyId: string;
  let foreignToken: string;
  let ownerToken: string;
  let tenantToken: string;
  let staffToken: string;
  let paymentIds: string[];
  let providerRequest: jest.SpyInstance;
  let payoutEnabled = false;

  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureE2eApp(app);
    dataSource = moduleFixture.get(DataSource);
    companyRepository = moduleFixture.get(getRepositoryToken(Company));
    currencyRepository = moduleFixture.get(getRepositoryToken(Currency));
    adminRepository = moduleFixture.get(getRepositoryToken(Admin));
    ownerRepository = moduleFixture.get(getRepositoryToken(Owner));
    tenantRepository = moduleFixture.get(getRepositoryToken(Tenant));
    propertyRepository = moduleFixture.get(getRepositoryToken(Property));
    leaseRepository = moduleFixture.get(getRepositoryToken(Lease));
    tenantAccountRepository = moduleFixture.get(
      getRepositoryToken(TenantAccount),
    );
    invoiceRepository = moduleFixture.get(getRepositoryToken(Invoice));
    usersService = moduleFixture.get(UsersService);

    await app.init();
    jest
      .spyOn(app.get(ProviderConfigService), 'enabled')
      .mockImplementation(() => payoutEnabled);
    providerRequest = jest
      .spyOn(app.get(ProviderHttpService), 'request')
      .mockRejectedValue(
        new Error('External requests are forbidden in calculation tests'),
      );
    await currencyRepository.query(
      `
        INSERT INTO currencies (code, name, symbol, decimal_places, is_active)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO NOTHING
      `,
      ['ARS', 'Peso argentino', '$', 2, true],
    );

    const company = await createTestCompany(companyRepository, {
      name: 'Payment Flow Test Company',
      taxId: `${uniqueId}-payment-flow`,
    });
    companyId = company.id;

    const adminUser = await createSuperAdminTestUser(
      usersService,
      adminRepository,
      {
        email: `admin-${uniqueId}@payment-flow.test`,
        password: 'Password123!',
        firstName: 'Payment',
        lastName: 'Admin',
        companyId,
      },
    );
    adminToken = await loginTestUser(
      app,
      adminUser.email as string,
      'Password123!',
    );

    const ownerUser = await createActiveTestUser(usersService, {
      email: `owner-${uniqueId}@payment-flow.test`,
      password: 'Password123!',
      firstName: 'Payment',
      lastName: 'Owner',
      role: UserRole.OWNER,
      companyId,
    });
    const owner = await ownerRepository.save(
      ownerRepository.create({ userId: ownerUser.id, companyId }),
    );
    ownerId = owner.id;
    ownerToken = await loginTestUser(
      app,
      ownerUser.email as string,
      'Password123!',
    );

    const tenantUser = await createActiveTestUser(usersService, {
      email: `tenant-${uniqueId}@payment-flow.test`,
      password: 'Password123!',
      firstName: 'Payment',
      lastName: 'Tenant',
      role: UserRole.TENANT,
      companyId,
    });
    tenantToken = await loginTestUser(
      app,
      tenantUser.email as string,
      'Password123!',
    );
    const tenant = await tenantRepository.save(
      tenantRepository.create({ userId: tenantUser.id, companyId }),
    );

    const property = await propertyRepository.save(
      propertyRepository.create({
        companyId,
        ownerId: owner.id,
        name: 'Payment Flow Apartment',
        propertyType: PropertyType.APARTMENT,
        addressStreet: 'Payment Flow 100',
        addressCity: 'Buenos Aires',
        addressState: 'Buenos Aires',
      }),
    );

    const lease = await leaseRepository.save(
      leaseRepository.create({
        companyId,
        ownerId: owner.id,
        tenantId: tenant.id,
        propertyId: property.id,
        contractType: ContractType.RENTAL,
        status: LeaseStatus.ACTIVE,
        startDate: new Date('2026-01-01T12:00:00Z'),
        endDate: new Date('2026-12-31T12:00:00Z'),
        monthlyRent: 1000,
        currency: 'ARS',
        paymentFrequency: PaymentFrequency.MONTHLY,
      }),
    );
    const account = await tenantAccountRepository.save(
      tenantAccountRepository.create({
        companyId,
        tenantId: tenant.id,
        leaseId: lease.id,
        balance: 1000,
        currencyCode: 'ARS',
      }),
    );
    tenantAccountId = account.id;

    const invoice = await invoiceRepository.save(
      invoiceRepository.create({
        companyId,
        leaseId: lease.id,
        ownerId: owner.id,
        tenantAccountId,
        invoiceNumber: `INV-${uniqueId}`,
        periodStart: new Date('2026-07-01T12:00:00Z'),
        periodEnd: new Date('2026-07-31T12:00:00Z'),
        issuedAt: new Date('2026-07-01T12:00:00Z'),
        dueDate: new Date('2026-07-10T12:00:00Z'),
        subtotal: 1000,
        total: 1000,
        balanceDue: 1000,
        currencyCode: 'ARS',
        amountPaid: 0,
        status: InvoiceStatus.PENDING,
      }),
    );
    invoiceId = invoice.id;
    const staff = await createActiveTestUser(usersService, {
      email: `staff-${uniqueId}@calculation.test`,
      password: 'Password123!',
      firstName: 'Staff',
      lastName: 'Calculation',
      companyId,
      role: UserRole.STAFF,
    });
    staffToken = await loginTestUser(
      app,
      staff.email as string,
      'Password123!',
    );
    foreignCompanyId = (
      await createTestCompany(companyRepository, {
        name: 'Foreign calculation',
        taxId: `foreign-${uniqueId}`,
      })
    ).id;
    const foreignAdmin = await createSuperAdminTestUser(
      usersService,
      adminRepository,
      {
        email: `foreign-${uniqueId}@calculation.test`,
        password: 'Password123!',
        firstName: 'Foreign',
        lastName: 'Admin',
        companyId: foreignCompanyId,
      },
    );
    foreignToken = await loginTestUser(
      app,
      foreignAdmin.email as string,
      'Password123!',
    );
    paymentIds = [];
    for (const [amount, date] of [
      ['400.01', '2026-07-05'],
      ['599.99', '2026-07-12'],
    ]) {
      const [payment] = await dataSource.query(
        `INSERT INTO payments(company_id,tenant_id,tenant_account_id,amount,currency,payment_date,payment_method,status,allocations_recorded)
         VALUES($1,$2,$3,$4,'ARS',$5,'bank_transfer','completed',true) RETURNING id`,
        [companyId, tenant.id, account.id, amount, date],
      );
      paymentIds.push(payment.id);
      await dataSource.query(
        `INSERT INTO payment_allocations(company_id,payment_id,invoice_id,amount,previous_invoice_status)
         VALUES($1,$2,$3,$4,'pending')`,
        [companyId, payment.id, invoiceId, amount],
      );
    }
  });

  const preview = (
    token = adminToken,
    extra: Record<string, string | undefined> = {},
  ) =>
    request(app.getHttpServer())
      .get('/settlements/calculation/preview')
      .set('Authorization', `Bearer ${token}`)
      .query({ ownerId, period: '2026-07', currency: 'ARS', ...extra });

  const clearGenerations = async () => {
    await purgeFinancialCorrections(dataSource, companyId);
    for (const table of [
      'settlement_generation_cancellations',
      'settlement_payout_effects_outbox',
      'settlement_payout_movements',
      'settlement_payout_reviews',
      'settlement_payout_outbox',
      'settlement_generation_sources',
      'settlement_generations',
    ])
      await dataSource.query(`DELETE FROM ${table} WHERE company_id=$1`, [
        companyId,
      ]);
  };
  beforeEach(async () => {
    payoutEnabled = false;
    await clearGenerations();
    await dataSource.query(
      'DELETE FROM tenant_account_movements WHERE tenant_account_id=$1',
      [tenantAccountId],
    );
    await dataSource.query(
      'UPDATE tenant_accounts SET current_balance=1000 WHERE id=$1',
      [tenantAccountId],
    );
    await dataSource.query('DELETE FROM credit_notes WHERE company_id=$1', [
      companyId,
    ]);
    await dataSource.query('DELETE FROM settlements WHERE owner_id=$1', [
      ownerId,
    ]);
    await dataSource.query(
      'DELETE FROM payment_allocations WHERE company_id=$1 AND invoice_id<>$2',
      [companyId, invoiceId],
    );
    await dataSource.query(
      'DELETE FROM invoices WHERE company_id=$1 AND id<>$2',
      [companyId, invoiceId],
    );
    await dataSource.query(
      `UPDATE owners SET commission_rate=5.25,deleted_at=NULL WHERE id=$1`,
      [ownerId],
    );
    await dataSource.query(
      `UPDATE invoices SET status='paid',total_amount=1000,paid_amount=1000,deleted_at=NULL,withholdings_total=75,due_date='2026-07-10' WHERE id=$1`,
      [invoiceId],
    );
    await dataSource.query(
      `UPDATE payments SET refunded_amount=0,currency='ARS',status='completed',allocations_recorded=true,deleted_at=NULL,
      amount=CASE WHEN id=$1 THEN 400.01 ELSE 599.99 END,
      payment_date=CASE WHEN id=$1 THEN DATE '2026-07-05' ELSE DATE '2026-07-12' END WHERE id=ANY($2::uuid[])`,
      [paymentIds[0], paymentIds],
    );
    await dataSource.query(
      `UPDATE payment_allocations SET refunded_amount=0,reversed_at=NULL,amount=CASE WHEN payment_id=$2 THEN 400.01 ELSE 599.99 END WHERE company_id=$1`,
      [companyId, paymentIds[0]],
    );
    await dataSource.query(
      `INSERT INTO credit_notes(company_id,invoice_id,payment_id,note_number,amount,currency,status)
      VALUES($1,$2,$3,'CALC-CN',10,'ARS','issued')`,
      [companyId, invoiceId, paymentIds[0]],
    );
  });

  afterEach(() => {
    expect(providerRequest).not.toHaveBeenCalled();
  });

  afterAll(async () => {
    if (dataSource) {
      if (companyId) await clearGenerations();
      if (tenantAccountId)
        await dataSource.query(
          'DELETE FROM tenant_account_movements WHERE tenant_account_id=$1',
          [tenantAccountId],
        );
      if (ownerId)
        await dataSource.query('DELETE FROM settlements WHERE owner_id=$1', [
          ownerId,
        ]);
      for (const id of [companyId, foreignCompanyId].filter(Boolean)) {
        for (const table of [
          'credit_notes',
          'payment_allocations',
          'payments',
          'invoices',
          'tenant_accounts',
          'leases',
          'properties',
          'tenants',
          'owners',
          'admins',
          'users',
        ])
          await dataSource.query(`DELETE FROM ${table} WHERE company_id=$1`, [
            id,
          ]);
        await dataSource.query('DELETE FROM companies WHERE id=$1', [id]);
      }
    }
    await app?.close();
  });

  it('counts split collections once, subtracts the credit once and preserves exact rounding', async () => {
    const { body } = await preview().expect(200);
    expect(body).toMatchObject({
      ownerId,
      period: '2026-07',
      currency: 'ARS',
      grossAmount: '990.00',
      commissionRate: '5.25',
      commissionAmount: '51.98',
      netBeforeWithholdings: '938.02',
      scheduledDate: '2026-07-12',
      existingSettlementIds: [],
    });
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]).toMatchObject({
      id: invoiceId,
      collectedAmount: '1000.00',
      creditedAmount: '10.00',
      grossAmount: '990.00',
    });
    expect(body.invoices[0].allocations).toHaveLength(2);
    expect(body.invoices[0].creditNotes).toHaveLength(1);
    expect(body.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect((await preview().expect(200)).body).toEqual(body);
    const [counts] = await dataSource.query(
      `SELECT (SELECT count(*) FROM settlements WHERE owner_id=$1)::int AS settlements,
      (SELECT count(*) FROM settlement_payout_outbox WHERE company_id=$2)::int AS payouts`,
      [ownerId, companyId],
    );
    expect(counts).toEqual({ settlements: 0, payouts: 0 });
  });

  it('honors zero commission and changes the source fingerprint', async () => {
    const before = (await preview().expect(200)).body;
    await dataSource.query('UPDATE owners SET commission_rate=0 WHERE id=$1', [
      ownerId,
    ]);
    const after = (await preview().expect(200)).body;
    expect(after).toMatchObject({
      commissionRate: '0.00',
      commissionAmount: '0.00',
      netBeforeWithholdings: '990.00',
    });
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('rounds commission once across invoices and keeps each allocation attributable', async () => {
    await dataSource.query('DELETE FROM credit_notes WHERE company_id=$1', [
      companyId,
    ]);
    await dataSource.query(
      'UPDATE owners SET commission_rate=12.50 WHERE id=$1',
      [ownerId],
    );
    await dataSource.query(
      'UPDATE invoices SET total_amount=0.04,paid_amount=0.04 WHERE id=$1',
      [invoiceId],
    );
    await dataSource.query(
      'UPDATE payments SET amount=CASE WHEN id=$1 THEN 0.01 ELSE 0.07 END WHERE id=ANY($2::uuid[])',
      [paymentIds[0], paymentIds],
    );
    await dataSource.query(
      'UPDATE payment_allocations SET amount=CASE WHEN payment_id=$1 THEN 0.01 ELSE 0.03 END WHERE invoice_id=$2',
      [paymentIds[0], invoiceId],
    );
    const [second] = await dataSource.query(
      `INSERT INTO invoices(company_id,lease_id,owner_id,tenant_account_id,invoice_number,period_start,period_end,due_date,subtotal,total_amount,paid_amount,status,currency)
      SELECT company_id,lease_id,owner_id,tenant_account_id,'SECOND-CALC',period_start,period_end,due_date,0.04,0.04,0.04,'paid','ARS' FROM invoices WHERE id=$1 RETURNING id`,
      [invoiceId],
    );
    await dataSource.query(
      `INSERT INTO payment_allocations(company_id,payment_id,invoice_id,amount,previous_invoice_status) VALUES($1,$2,$3,0.04,'pending')`,
      [companyId, paymentIds[1], second.id],
    );
    const { body } = await preview().expect(200);
    expect(body).toMatchObject({
      grossAmount: '0.08',
      commissionAmount: '0.01',
      netBeforeWithholdings: '0.07',
    });
    expect(body.invoices).toHaveLength(2);
    expect(
      body.invoices.flatMap((i: { allocations: unknown[] }) => i.allocations),
    ).toHaveLength(3);
  });

  it('retains cents at the invoice numeric limit', async () => {
    await dataSource.query(
      'UPDATE invoices SET total_amount=999999999999.99,paid_amount=999999999999.99 WHERE id=$1',
      [invoiceId],
    );
    await dataSource.query(
      'UPDATE payments SET amount=999999999599.98 WHERE id=$1',
      [paymentIds[1]],
    );
    await dataSource.query(
      'UPDATE payment_allocations SET amount=999999999599.98 WHERE payment_id=$1',
      [paymentIds[1]],
    );
    expect((await preview().expect(200)).body).toMatchObject({
      grossAmount: '999999999989.99',
      commissionAmount: '52499999999.47',
      netBeforeWithholdings: '947499999990.52',
    });
  });

  it('rejects paid_amount drift and foreign-company references without exposing sources', async () => {
    await dataSource.query('UPDATE invoices SET paid_amount=999 WHERE id=$1', [
      invoiceId,
    ]);
    await preview().expect(409);
    await dataSource.query('UPDATE invoices SET paid_amount=1000 WHERE id=$1', [
      invoiceId,
    ]);
    try {
      await dataSource.query(
        'UPDATE payment_allocations SET company_id=$1 WHERE payment_id=$2',
        [foreignCompanyId, paymentIds[0]],
      );
      const response = await preview().expect(409);
      expect(JSON.stringify(response.body)).not.toContain(paymentIds[0]);
    } finally {
      await dataSource.query(
        'UPDATE payment_allocations SET company_id=$1 WHERE payment_id=$2',
        [companyId, paymentIds[0]],
      );
    }
  });

  it('rejects missing account scope, malformed commission and a rate above 100 percent', async () => {
    try {
      await dataSource.query(
        'UPDATE invoices SET tenant_account_id=NULL WHERE id=$1',
        [invoiceId],
      );
      expect((await preview().expect(409)).status).toBe(409);
    } finally {
      await dataSource.query(
        'UPDATE invoices SET tenant_account_id=$1 WHERE id=$2',
        [tenantAccountId, invoiceId],
      );
    }
    for (const rate of ['-1.00', '100.01']) {
      await dataSource.query(
        'UPDATE owners SET commission_rate=$1 WHERE id=$2',
        [rate, ownerId],
      );
      await preview().expect(409);
    }
  });

  it('reports existing settlements even in another currency, without claiming unreserved funds', async () => {
    const [settlement] = await dataSource.query(
      `INSERT INTO settlements(owner_id,period,gross_amount,commission_amount,net_amount,currency)
      VALUES($1,'2026-07',100,0,100,'USD') RETURNING id`,
      [ownerId],
    );
    expect((await preview().expect(200)).body.existingSettlementIds).toEqual([
      settlement.id,
    ]);
  });

  it('does not include unpaid, deleted, other-period or other-currency invoices', async () => {
    for (const extra of [{ period: '2026-08' }, { currency: 'USD' }])
      expect((await preview(adminToken, extra).expect(200)).body).toMatchObject(
        { invoices: [], grossAmount: '0.00', scheduledDate: null },
      );
    await dataSource.query(`UPDATE invoices SET status='partial' WHERE id=$1`, [
      invoiceId,
    ]);
    expect((await preview().expect(200)).body.invoices).toEqual([]);
    await dataSource.query(
      `UPDATE invoices SET status='paid',deleted_at=NOW() WHERE id=$1`,
      [invoiceId],
    );
    expect((await preview().expect(200)).body.invoices).toEqual([]);
  });

  it.each([
    "currency='USD'",
    "status='cancelled'",
    'allocations_recorded=false',
    'deleted_at=NOW()',
    'amount=1',
  ])('rejects an inconsistent source payment: %s', async (change) => {
    await dataSource.query(`UPDATE payments SET ${change} WHERE id=$1`, [
      paymentIds[0],
    ]);
    await preview().expect(409);
  });

  it('rejects reversed or missing allocations on a purportedly paid invoice', async () => {
    await dataSource.query(
      'UPDATE payment_allocations SET reversed_at=NOW() WHERE payment_id=$1',
      [paymentIds[0]],
    );
    expect((await preview().expect(409)).status).toBe(409);
    await dataSource.query(
      'UPDATE payment_allocations SET reversed_at=NOW() WHERE company_id=$1',
      [companyId],
    );
    await preview().expect(409);
  });

  it.each(["currency='USD'", 'amount=1000.01'])(
    'rejects an inconsistent credit note: %s',
    async (change) => {
      await dataSource.query(
        `UPDATE credit_notes SET ${change} WHERE company_id=$1`,
        [companyId],
      );
      await preview().expect(409);
    },
  );

  it('ignores cancelled credits and schedules early collections on the due date', async () => {
    await dataSource.query(
      `UPDATE credit_notes SET status='cancelled' WHERE company_id=$1`,
      [companyId],
    );
    await dataSource.query(
      `UPDATE payments SET payment_date='2026-07-05' WHERE id=ANY($1::uuid[])`,
      [paymentIds],
    );
    expect((await preview().expect(200)).body).toMatchObject({
      grossAmount: '1000.00',
      commissionAmount: '52.50',
      scheduledDate: '2026-07-10',
    });
  });

  it('uses the authenticated company, requires admin and rejects unauthenticated reads', async () => {
    await preview(foreignToken).expect(404);
    for (const token of [ownerToken, tenantToken, staffToken])
      await preview(token).expect(403);
    await request(app.getHttpServer())
      .get('/settlements/calculation/preview')
      .expect(401);
    await dataSource.query('UPDATE owners SET deleted_at=NOW() WHERE id=$1', [
      ownerId,
    ]);
    await preview().expect(404);
  });

  it.each([
    { period: '2026-00' },
    { period: '2026-13' },
    { period: '0000-01' },
    { currency: 'ars' },
    { ownerId: 'invalid' },
    { companyId: 'foreign' },
  ])('validates preview input %j', async (extra) => {
    await preview(adminToken, extra).expect(400);
  });

  const generationInput = async () => ({
    ownerId,
    period: '2026-07',
    currency: 'ARS',
    confirmed: true,
    idempotencyKey: randomUUID(),
    expectedFingerprint: (await preview().expect(200)).body.fingerprint,
    additionalWithholdings: '0.00',
    withholdingReason: 'Sin retenciones adicionales',
  });
  const generate = (input: object, token = adminToken) =>
    request(app.getHttpServer())
      .post('/settlements/generate')
      .set('Authorization', `Bearer ${token}`)
      .send(input);
  const voidGeneration = (id: string, token = adminToken) =>
    request(app.getHttpServer())
      .post(`/settlements/${id}/generation/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        confirmed: true,
        reason: 'Anulación administrativa para corregir fuentes',
      });
  const requestPayout = (id: string, amount = '938.02') =>
    request(app.getHttpServer())
      .post(`/settlements/${id}/payout`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        confirmed: true,
        expectedAmount: amount,
        currency: 'ARS',
        recipientEmail: 'owner@calculation.test',
      });

  const holdFirstCalculation = () => {
    const calculator = app.get(SettlementCalculationService);
    const original = calculator.calculate.bind(calculator);
    let observed!: () => void;
    let resume!: () => void;
    const initial = new Promise<void>((resolve) => {
      observed = resolve;
    });
    const release = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let calls = 0;
    const calculate = jest
      .spyOn(calculator, 'calculate')
      .mockImplementation(async (...args: Parameters<typeof original>) => {
        const value = await original(...args);
        if (++calls === 1) {
          observed();
          await release;
        }
        return value;
      });
    return { initial, resume, restore: () => calculate.mockRestore() };
  };

  it('records partial refund owner debt without changing a transferred settlement or its historical commission', async () => {
    payoutEnabled = true;
    await dataSource.query('DELETE FROM credit_notes WHERE company_id=$1', [
      companyId,
    ]);
    await dataSource.query(
      `INSERT INTO credit_notes(company_id,invoice_id,payment_id,note_number,amount,currency,status,origin,tenant_account_id)
      VALUES($1,$2,$3,'CALC-CN',10,'ARS','issued','late_fee_settlement',$4)`,
      [companyId, invoiceId, paymentIds[0], tenantAccountId],
    );
    await dataSource.query(
      'UPDATE tenant_accounts SET current_balance=-10 WHERE id=$1',
      [tenantAccountId],
    );
    const generated = (await generate(await generationInput()).expect(201))
      .body;
    await dataSource.query(
      `UPDATE settlements SET status='completed',transfer_reference='recorded-transfer' WHERE id=$1`,
      [generated.settlementId],
    );
    const refundKey = randomUUID();
    const refund = () =>
      request(app.getHttpServer())
        .post(`/payments/${paymentIds[0]}/refunds`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', refundKey)
        .send({
          amount: 100,
          reason: 'Devolución parcial registrada por administración',
        });
    expect((await refund().expect(201)).body.amount).toBe('100.00');
    await refund().expect(201);
    const [correction] = await dataSource.query(
      `SELECT gross_amount::text,commission_amount::text,net_amount::text FROM settlement_source_compensations WHERE settlement_id=$1`,
      [generated.settlementId],
    );
    expect(correction).toEqual({
      gross_amount: '90.00',
      commission_amount: '4.73',
      net_amount: '85.27',
    });
    const [historical] = await dataSource.query(
      `SELECT status,gross_amount::text,commission_amount::text,net_amount::text,transfer_reference FROM settlements WHERE id=$1`,
      [generated.settlementId],
    );
    expect(historical).toEqual({
      status: 'completed',
      gross_amount: '990.00',
      commission_amount: '51.98',
      net_amount: '938.02',
      transfer_reference: 'recorded-transfer',
    });
    const [account] = await dataSource.query(
      'SELECT current_balance::text FROM tenant_accounts WHERE id=$1',
      [tenantAccountId],
    );
    expect(account.current_balance).toBe('100.00');
    await expect(
      dataSource.query(
        'UPDATE settlement_source_compensations SET net_amount=0 WHERE settlement_id=$1',
        [generated.settlementId],
      ),
    ).rejects.toThrow('immutable');
  });

  it('keeps generation and void disabled, including before opening a transaction', async () => {
    const input = await generationInput();
    const tx = jest.spyOn(dataSource, 'transaction');
    try {
      await generate(input).expect(503);
      await voidGeneration(randomUUID()).expect(503);
      expect(tx).not.toHaveBeenCalled();
    } finally {
      tx.mockRestore();
    }
  });

  it('atomically generates once under concurrent retries, snapshots deductions and reserves invoices', async () => {
    payoutEnabled = true;
    const input = {
      ...(await generationInput()),
      additionalWithholdings: '38.02',
      withholdingReason: 'Retención manual confirmada por administración',
    };
    const responses = await Promise.all([
      generate(input).expect(201),
      generate(input).expect(201),
    ]);
    expect(responses[0].body).toEqual(responses[1].body);
    const generated = responses[0].body;
    expect(generated).toMatchObject({
      state: 'active',
      snapshot: { netAmount: '900.00', additionalWithholdings: '38.02' },
    });
    const [settlement] = await dataSource.query(
      'SELECT status,net_amount::text,withholdings_amount::text FROM settlements WHERE id=$1',
      [generated.settlementId],
    );
    expect(settlement).toEqual({
      status: 'pending',
      net_amount: '900.00',
      withholdings_amount: '38.02',
    });
    expect((await preview().expect(200)).body).toMatchObject({
      invoices: [],
      existingSettlementIds: [generated.settlementId],
    });
    await generate({
      ...input,
      withholdingReason: 'Otra explicación de retención',
    }).expect(409);
    await generate({ ...input, idempotencyKey: randomUUID() }).expect(409);
    const [counts] = await dataSource.query(
      `SELECT (SELECT count(*) FROM settlement_generation_sources WHERE company_id=$1)::int AS sources,
      (SELECT count(*) FROM settlement_payout_outbox WHERE company_id=$1)::int AS payouts`,
      [companyId],
    );
    expect(counts).toEqual({ sources: 1, payouts: 0 });
  });

  it('rejects stale confirmation, excessive deductions, malformed input and untracked history', async () => {
    payoutEnabled = true;
    const input = await generationInput();
    expect(
      (
        await generate({
          ...input,
          expectedFingerprint: '0'.repeat(64),
        }).expect(409)
      ).status,
    ).toBe(409);
    await generate({ ...input, additionalWithholdings: '938.02' }).expect(409);
    await generate({ ...input, additionalWithholdings: '-1.00' }).expect(400);
    await generate({ ...input, confirmed: false }).expect(400);
    await generate({ ...input, withholdingReason: 'short' }).expect(400);
    await dataSource.query(
      `INSERT INTO settlements(owner_id,period,gross_amount,commission_amount,net_amount,currency) VALUES($1,'2026-07',100,0,100,'ARS')`,
      [ownerId],
    );
    await generate(await generationInput()).expect(409);
  });

  it('rejects a collection cancelled between initial validation and source locking', async () => {
    payoutEnabled = true;
    const input = await generationInput();
    const hold = holdFirstCalculation();
    try {
      const result = generate(input).then((response) => response);
      await hold.initial;
      await dataSource.query(
        `UPDATE payments SET status='cancelled' WHERE id=$1`,
        [paymentIds[0]],
      );
      hold.resume();
      expect((await result).status).toBe(409);
      const [count] = await dataSource.query(
        'SELECT count(*)::int AS count FROM settlements WHERE owner_id=$1',
        [ownerId],
      );
      expect(count.count).toBe(0);
    } finally {
      hold.resume();
      hold.restore();
    }
  });

  it('reserves each invoice once under distinct concurrent generation keys', async () => {
    payoutEnabled = true;
    const input = await generationInput();
    const results = await Promise.all([
      generate(input),
      generate({ ...input, idempotencyKey: randomUUID() }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });

  it('allows supplementary paid invoices in the same period without reserving an earlier source again', async () => {
    payoutEnabled = true;
    const first = (await generate(await generationInput()).expect(201)).body;
    const [secondInvoice] = await dataSource.query(
      `INSERT INTO invoices(company_id,lease_id,owner_id,tenant_account_id,invoice_number,period_start,period_end,due_date,subtotal,total_amount,paid_amount,status,currency)
      SELECT company_id,lease_id,owner_id,tenant_account_id,'SUPPLEMENTARY',period_start,period_end,due_date,100,100,100,'paid','ARS' FROM invoices WHERE id=$1 RETURNING id`,
      [invoiceId],
    );
    await dataSource.query(
      'UPDATE payments SET amount=amount+100 WHERE id=$1',
      [paymentIds[1]],
    );
    await dataSource.query(
      `INSERT INTO payment_allocations(company_id,payment_id,invoice_id,amount,previous_invoice_status) VALUES($1,$2,$3,100,'pending')`,
      [companyId, paymentIds[1], secondInvoice.id],
    );
    const input = await generationInput();
    const hold = holdFirstCalculation();
    const generating = generate(input).then((response) => response);
    try {
      await hold.initial;
      // Owner serialization must allow payout FK checks while source payments are shared.
      await requestPayout(first.settlementId)
        .timeout({ deadline: 5000 })
        .expect(201);
    } finally {
      hold.resume();
      await generating;
      hold.restore();
    }
    const generated = await generating;
    expect(generated.status).toBe(201);
    const second = generated.body;
    expect(second.settlementId).not.toBe(first.settlementId);
    expect(
      second.snapshot.calculation.invoices.map((i: { id: string }) => i.id),
    ).toEqual([secondInvoice.id]);
    expect(second.snapshot.netAmount).toBe('94.75');
    expect((await preview().expect(200)).body.invoices).toEqual([]);
  });

  it('schedules a confirmed payout no earlier than its settlement date in Argentina', async () => {
    payoutEnabled = true;
    await dataSource.query(
      `UPDATE invoices SET due_date='2999-07-10' WHERE id=$1`,
      [invoiceId],
    );
    const generated = (await generate(await generationInput()).expect(201))
      .body;
    await requestPayout(generated.settlementId).expect(201);
    const [job] = await dataSource.query(
      'SELECT next_attempt_at FROM settlement_payout_outbox WHERE settlement_id=$1',
      [generated.settlementId],
    );
    expect(job.next_attempt_at.toISOString()).toBe('2999-07-10T03:00:00.000Z');
    expect(
      (await app.get(SettlementPayoutsService).processDue()).processed,
    ).toBe(0);
  });

  it('rolls back the settlement if source persistence fails', async () => {
    payoutEnabled = true;
    const input = await generationInput();
    await dataSource.query(
      `CREATE OR REPLACE FUNCTION generation_test_reject_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional source failure'; END $$`,
    );
    await dataSource.query(
      `CREATE TRIGGER generation_test_reject_source BEFORE INSERT ON settlement_generation_sources FOR EACH ROW WHEN(NEW.company_id='${companyId}'::uuid) EXECUTE FUNCTION generation_test_reject_source()`,
    );
    try {
      await generate(input).expect(500);
      const [row] = await dataSource.query(
        'SELECT count(*)::int AS count FROM settlements WHERE owner_id=$1',
        [ownerId],
      );
      expect(row.count).toBe(0);
    } finally {
      await dataSource.query(
        'DROP TRIGGER generation_test_reject_source ON settlement_generation_sources',
      );
      await dataSource.query('DROP FUNCTION generation_test_reject_source()');
    }
    await generate(input).expect(201);
  });

  it('preserves immutable sources, releases them on audited void and permits corrected generation', async () => {
    payoutEnabled = true;
    const input = await generationInput();
    const { body: first } = await generate(input).expect(201);
    await expect(
      dataSource.query(
        `UPDATE settlement_generations SET snapshot='{}' WHERE id=$1`,
        [first.id],
      ),
    ).rejects.toThrow('immutable');
    await expect(
      dataSource.query(
        `UPDATE settlement_generation_sources SET snapshot='{}' WHERE generation_id=$1`,
        [first.id],
      ),
    ).rejects.toThrow('immutable');
    await expect(
      dataSource.query(
        'UPDATE settlement_generation_sources SET released_at=now() WHERE generation_id=$1',
        [first.id],
      ),
    ).rejects.toThrow('Void the generation');
    const { body: voided } = await voidGeneration(first.settlementId).expect(
      201,
    );
    expect(voided).toMatchObject({ state: 'voided', snapshot: first.snapshot });
    expect(voided.voidedBy).toBe(first.requestedBy);
    expect(voided.voidedAt).toBeTruthy();
    expect((await voidGeneration(first.settlementId).expect(201)).body).toEqual(
      voided,
    );
    expect((await generate(input).expect(201)).body).toEqual(voided);
    await expect(
      dataSource.query(
        `UPDATE settlement_generation_sources SET released_at=NULL WHERE generation_id=$1`,
        [first.id],
      ),
    ).rejects.toThrow('immutable');
    await expect(
      dataSource.query(
        `UPDATE settlement_generations SET void_reason='Altered explanation' WHERE id=$1`,
        [first.id],
      ),
    ).rejects.toThrow('immutable');
    const second = (await generate(await generationInput()).expect(201)).body;
    expect(second.settlementId).not.toBe(first.settlementId);
    await requestPayout(first.settlementId).expect(409);
    const [row] = await dataSource.query(
      'SELECT status FROM settlements WHERE id=$1',
      [first.settlementId],
    );
    expect(row.status).toBe('cancelled');
  });

  it('does not confuse cancelled source collections with money available to transfer', async () => {
    payoutEnabled = true;
    const generated = await generate(await generationInput()).expect(201);
    expect(generated.status).toBe(201);
    const g = generated.body;
    await request(app.getHttpServer())
      .patch(`/payments/${paymentIds[0]}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await requestPayout(g.settlementId).expect(409);
    await voidGeneration(g.settlementId).expect(201);
  });

  it('rejects tampered settlement totals and preserves the agreed commission when owner settings change', async () => {
    payoutEnabled = true;
    const generated = await generate(await generationInput()).expect(201);
    expect(generated.status).toBe(201);
    const g = generated.body;
    await dataSource.query(
      'UPDATE settlements SET gross_amount=2000 WHERE id=$1',
      [g.settlementId],
    );
    await requestPayout(g.settlementId).expect(409);
    await dataSource.query(
      'UPDATE settlements SET gross_amount=990 WHERE id=$1',
      [g.settlementId],
    );
    await dataSource.query('UPDATE owners SET commission_rate=20 WHERE id=$1', [
      ownerId,
    ]);
    await requestPayout(g.settlementId).expect(201);
  });

  it('revalidates before provider intent and permits audited void of a safely failed job', async () => {
    payoutEnabled = true;
    const { body: g } = await generate(await generationInput()).expect(201);
    await requestPayout(g.settlementId).expect(201);
    await dataSource.query(
      `UPDATE credit_notes SET amount=20 WHERE company_id=$1`,
      [companyId],
    );
    await app.get(SettlementPayoutsService).processDue();
    const [job] = await dataSource.query(
      'SELECT status,error_code,payout_id FROM settlement_payout_outbox WHERE settlement_id=$1',
      [g.settlementId],
    );
    expect(job).toEqual({
      status: 'failed',
      error_code: 'source_changed',
      payout_id: null,
    });
    await voidGeneration(g.settlementId).expect(201);
  });

  it('cancels a queued payout but never releases an uncertain transfer', async () => {
    payoutEnabled = true;
    const { body: g } = await generate(await generationInput()).expect(201);
    await requestPayout(g.settlementId).expect(201);
    await dataSource.query(
      `UPDATE settlement_payout_outbox SET status='dispatching' WHERE settlement_id=$1`,
      [g.settlementId],
    );
    await voidGeneration(g.settlementId).expect(409);
    // Restore an unsubmitted fixture; no provider is called by this test.
    await dataSource.query(
      `UPDATE settlement_payout_outbox SET status='queued' WHERE settlement_id=$1`,
      [g.settlementId],
    );
    await voidGeneration(g.settlementId).expect(201);
    const [job] = await dataSource.query(
      'SELECT status,error_code FROM settlement_payout_outbox WHERE settlement_id=$1',
      [g.settlementId],
    );
    expect(job).toEqual({ status: 'failed', error_code: 'generation_voided' });
    await request(app.getHttpServer())
      .post(`/settlements/${g.settlementId}/payout/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'retry',
        confirmed: true,
        reason: 'No debe reenviarse una liquidación anulada',
      })
      .expect(409);
  });

  it('still reconciles an already submitted payout after its source changes', async () => {
    payoutEnabled = true;
    const { body: g } = await generate(await generationInput()).expect(201);
    await requestPayout(g.settlementId).expect(201);
    const suffix = randomUUID().replaceAll('-', '');
    await dataSource.query(
      `UPDATE settlement_payout_outbox SET status='awaiting',payout_id=$2,transaction_id=$3 WHERE settlement_id=$1`,
      [g.settlementId, `POP${suffix}`, `TOP${suffix}`],
    );
    await dataSource.query(
      `UPDATE payments SET status='cancelled' WHERE id=$1`,
      [paymentIds[0]],
    );
    const remote = jest
      .spyOn(app.get(MercadoPagoPayoutsClient), 'transaction')
      .mockResolvedValue({
        id: `TOP${suffix}`,
        external_reference: `rent_settlement_${g.settlementId}`,
        status: 'success',
        status_detail: 'accredited',
        last_update_date: '2026-09-01T12:00:00Z',
        amount: { currency: 'ARS', value: 938.02 },
      });
    try {
      await app.get(SettlementPayoutsService).processDue();
      expect(remote).toHaveBeenCalledTimes(1);
      const [settlement] = await dataSource.query(
        'SELECT status FROM settlements WHERE id=$1',
        [g.settlementId],
      );
      expect(settlement.status).toBe('completed');
      await voidGeneration(g.settlementId).expect(409);
    } finally {
      remote.mockRestore();
    }
  });

  it('keeps snapshots readable while disabled and enforces company and admin scope on all generation routes', async () => {
    payoutEnabled = true;
    const input = await generationInput();
    expect((await generate(input, foreignToken).expect(404)).status).toBe(404);
    for (const token of [ownerToken, tenantToken, staffToken])
      await generate(input, token).expect(403);
    const { body: g } = await generate(input).expect(201);
    await voidGeneration(g.settlementId, foreignToken).expect(404);
    for (const token of [ownerToken, tenantToken, staffToken])
      await voidGeneration(g.settlementId, token).expect(403);
    payoutEnabled = false;
    await request(app.getHttpServer())
      .get(`/settlements/${g.settlementId}/generation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/settlements/${g.settlementId}/generation`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    for (const token of [ownerToken, tenantToken, staffToken])
      await request(app.getHttpServer())
        .get(`/settlements/${g.settlementId}/generation`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
  });

  const generationOverview = (
    extra: Record<string, string> = {},
    token = adminToken,
  ) =>
    request(app.getHttpServer())
      .get('/settlements/generation/overview')
      .set('Authorization', `Bearer ${token}`)
      .query({ ownerId, ...extra });
  const cancelRequest = (requestKey: string, token = adminToken) =>
    request(app.getHttpServer())
      .post('/settlements/generation/cancel-request')
      .set('Authorization', `Bearer ${token}`)
      .send({ ownerId, requestKey, confirmed: true });

  it('exposes disabled availability and scoped request recovery without provider calls', async () => {
    expect((await generationOverview().expect(200)).body).toEqual({
      enabled: false,
      canVoid: false,
      requestCancelled: false,
      generation: null,
    });
    await generationOverview({}, foreignToken).expect(404);
    for (const token of [ownerToken, tenantToken, staffToken])
      await generationOverview({}, token).expect(403);
    await generationOverview({ settlementId: randomUUID() }).expect(404);
    await generationOverview({ requestKey: 'invalid' }).expect(400);
    await generationOverview({
      requestKey: randomUUID(),
      settlementId: randomUUID(),
    }).expect(400);
    const key = randomUUID();
    expect(
      (await generationOverview({ requestKey: key }).expect(200)).body
        .generation,
    ).toBeNull();
    payoutEnabled = true;
    const input = { ...(await generationInput()), idempotencyKey: key };
    const generated = (await generate(input).expect(201)).body;
    expect(
      (await generationOverview({ requestKey: key }).expect(200)).body,
    ).toMatchObject({ enabled: true, canVoid: true, generation: generated });
    payoutEnabled = false;
    expect(
      (
        await generationOverview({
          settlementId: generated.settlementId,
        }).expect(200)
      ).body,
    ).toMatchObject({ enabled: false, canVoid: false, generation: generated });
  });

  it('fences a discarded unregistered request even while generation is disabled', async () => {
    const input = await generationInput();
    const cancelled = (await cancelRequest(input.idempotencyKey).expect(201))
      .body;
    expect(cancelled).toEqual({
      enabled: false,
      canVoid: false,
      requestCancelled: true,
      generation: null,
    });
    expect(
      (await cancelRequest(input.idempotencyKey).expect(201)).body,
    ).toEqual(cancelled);
    expect(
      (
        await generationOverview({ requestKey: input.idempotencyKey }).expect(
          200,
        )
      ).body.requestCancelled,
    ).toBe(true);
    await expect(
      dataSource.query(
        'UPDATE settlement_generation_cancellations SET created_at=now() WHERE company_id=$1',
        [companyId],
      ),
    ).rejects.toThrow('immutable');
    payoutEnabled = true;
    await generate(input).expect(409);
    await generate({ ...input, idempotencyKey: randomUUID() }).expect(201);
  });

  it('returns an existing generation when discard races an in-flight successful request', async () => {
    payoutEnabled = true;
    const input = await generationInput();
    const hold = holdFirstCalculation();
    const generating = generate(input).then((response) => response);
    let discarded!: ReturnType<typeof cancelRequest>;
    try {
      await hold.initial;
      discarded = cancelRequest(input.idempotencyKey);
      const result = discarded.then((response) => response);
      hold.resume();
      const [generationResponse, discardResponse] = await Promise.all([
        generating,
        result,
      ]);
      expect(generationResponse.status).toBe(201);
      expect(discardResponse.status).toBe(201);
      expect(discardResponse.body).toMatchObject({
        generation: generationResponse.body,
        requestCancelled: false,
        canVoid: true,
      });
      expect(discardResponse.body.generation.state).toBe('active');
    } finally {
      hold.resume();
      await generating;
      hold.restore();
    }
  });

  it('requires scope, administrator role and confirmation to discard requests', async () => {
    const key = randomUUID();
    expect((await cancelRequest(key, foreignToken).expect(404)).status).toBe(
      404,
    );
    for (const token of [ownerToken, tenantToken, staffToken])
      await cancelRequest(key, token).expect(403);
    await request(app.getHttpServer())
      .post('/settlements/generation/cancel-request')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ownerId, requestKey: key, confirmed: false })
      .expect(400);
    await request(app.getHttpServer())
      .post('/settlements/generation/cancel-request')
      .send({ ownerId, requestKey: key, confirmed: true })
      .expect(401);
  });

  it('reports a historical calculation as absent and blocks voids of submitted transfers', async () => {
    const [legacy] = await dataSource.query(
      `INSERT INTO settlements(owner_id,period,gross_amount,commission_amount,net_amount) VALUES($1,'2026-06',100,0,100) RETURNING id`,
      [ownerId],
    );
    expect(
      (await generationOverview({ settlementId: legacy.id }).expect(200)).body
        .generation,
    ).toBeNull();
    payoutEnabled = true;
    const generated = (await generate(await generationInput()).expect(201))
      .body;
    await requestPayout(generated.settlementId).expect(201);
    expect(
      (
        await generationOverview({
          settlementId: generated.settlementId,
        }).expect(200)
      ).body.canVoid,
    ).toBe(true);
    await dataSource.query(
      `UPDATE settlement_payout_outbox SET status='dispatching' WHERE settlement_id=$1`,
      [generated.settlementId],
    );
    expect(
      (
        await generationOverview({
          settlementId: generated.settlementId,
        }).expect(200)
      ).body.canVoid,
    ).toBe(false);
  });
});
