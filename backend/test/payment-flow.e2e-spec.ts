import { INestApplication } from '@nestjs/common';
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
import { PaymentMethod } from '../src/payments/entities/payment.entity';
import { TenantAccount } from '../src/payments/entities/tenant-account.entity';
import {
  configureE2eApp,
  createActiveTestUser,
  createSuperAdminTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Payment accounting flow (e2e)', () => {
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

    const tenantUser = await createActiveTestUser(usersService, {
      email: `tenant-${uniqueId}@payment-flow.test`,
      password: 'Password123!',
      firstName: 'Payment',
      lastName: 'Tenant',
      role: UserRole.TENANT,
      companyId,
    });
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
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
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
        periodStart: new Date('2026-07-01'),
        periodEnd: new Date('2026-07-31'),
        issuedAt: new Date('2026-07-01'),
        dueDate: new Date('2026-07-10'),
        subtotal: 1000,
        total: 1000,
        balanceDue: 1000,
        currencyCode: 'ARS',
        amountPaid: 0,
        status: InvoiceStatus.PENDING,
      }),
    );
    invoiceId = invoice.id;
  });

  afterAll(async () => {
    if (companyId) {
      await dataSource.query(
        `DELETE FROM documents WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM receipts WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM tenant_account_movements
         WHERE tenant_account_id IN (
           SELECT id FROM tenant_accounts WHERE company_id = $1::uuid
         )`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM payment_items
         WHERE payment_id IN (
           SELECT id FROM payments WHERE company_id = $1::uuid
         )`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM payments WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM invoices WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM tenant_accounts WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(`DELETE FROM leases WHERE company_id = $1::uuid`, [
        companyId,
      ]);
      await dataSource.query(
        `DELETE FROM properties WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM tenants WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(`DELETE FROM owners WHERE company_id = $1::uuid`, [
        companyId,
      ]);
      await dataSource.query(`DELETE FROM admins WHERE company_id = $1::uuid`, [
        companyId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE company_id = $1::uuid`, [
        companyId,
      ]);
      await dataSource.query(`DELETE FROM companies WHERE id = $1::uuid`, [
        companyId,
      ]);
    }
    await app?.close();
  });

  it('confirms a payment, settles its invoice and persists a downloadable receipt PDF', async () => {
    expect.hasAssertions();

    const created = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantAccountId,
        amount: 1000,
        currencyCode: 'ARS',
        paymentDate: '2026-07-10',
        method: PaymentMethod.BANK_TRANSFER,
        reference: `TRANSFER-${uniqueId}`,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      tenantAccountId,
      status: 'pending',
      method: PaymentMethod.BANK_TRANSFER,
    });

    const confirmed = await request(app.getHttpServer())
      .patch(`/payments/${created.body.id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(confirmed.body).toMatchObject({
      id: created.body.id,
      status: 'completed',
      receipt: {
        amount: '1000.00',
        currencyCode: 'ARS',
      },
    });
    expect(confirmed.body.receipt.pdfUrl).toMatch(/^db:\/\/document\//);

    const [account] = await dataSource.query(
      `SELECT current_balance FROM tenant_accounts WHERE id = $1::uuid`,
      [tenantAccountId],
    );
    expect(Number(account.current_balance)).toBe(0);

    const [movement] = await dataSource.query(
      `SELECT movement_type, amount, balance_after, reference_type, reference_id
       FROM tenant_account_movements
       WHERE tenant_account_id = $1::uuid`,
      [tenantAccountId],
    );
    expect(movement).toMatchObject({
      movement_type: 'payment',
      reference_type: 'payment',
      reference_id: created.body.id,
    });
    expect(Number(movement.amount)).toBe(-1000);
    expect(Number(movement.balance_after)).toBe(0);

    const [invoice] = await dataSource.query(
      `SELECT status, paid_amount FROM invoices WHERE id = $1::uuid`,
      [invoiceId],
    );
    expect(invoice.status).toBe('paid');
    expect(Number(invoice.paid_amount)).toBe(1000);

    const [document] = await dataSource.query(
      `SELECT entity_type, entity_id, file_url, file_mime_type, file_size,
              octet_length(file_data) AS stored_size
       FROM documents
       WHERE company_id = $1::uuid AND entity_type = 'receipt'`,
      [companyId],
    );
    expect(document).toMatchObject({
      entity_type: 'receipt',
      entity_id: confirmed.body.receipt.id,
      file_mime_type: 'application/pdf',
    });
    expect(document.file_url).toBe(confirmed.body.receipt.pdfUrl);
    expect(Number(document.file_size)).toBeGreaterThan(100);
    expect(Number(document.stored_size)).toBe(Number(document.file_size));

    const pdf = await request(app.getHttpServer())
      .get(`/payments/${created.body.id}/receipt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .expect('Content-Type', /application\/pdf/)
      .expect(200);
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });
});
