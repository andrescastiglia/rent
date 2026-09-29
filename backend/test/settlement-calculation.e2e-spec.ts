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

  beforeEach(async () => {
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
      `UPDATE invoices SET status='paid',total_amount=1000,paid_amount=1000,deleted_at=NULL,withholdings_total=75 WHERE id=$1`,
      [invoiceId],
    );
    await dataSource.query(
      `UPDATE payments SET currency='ARS',status='completed',allocations_recorded=true,deleted_at=NULL,
      amount=CASE WHEN id=$1 THEN 400.01 ELSE 599.99 END,
      payment_date=CASE WHEN id=$1 THEN DATE '2026-07-05' ELSE DATE '2026-07-12' END WHERE id=ANY($2::uuid[])`,
      [paymentIds[0], paymentIds],
    );
    await dataSource.query(
      `UPDATE payment_allocations SET reversed_at=NULL,amount=CASE WHEN payment_id=$2 THEN 400.01 ELSE 599.99 END WHERE company_id=$1`,
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
      await preview().expect(409);
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
    await preview().expect(409);
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
});
