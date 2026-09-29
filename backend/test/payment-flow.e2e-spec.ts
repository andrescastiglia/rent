import { createHash, randomUUID } from 'node:crypto';
import { PaymentsService } from '../src/payments/payments.service';
import { AiToolExecutorService } from '../src/ai/ai-tool-executor.service';
import { PaymentItemType } from '../src/payments/entities/payment-item.entity';
import { verifyFinancialDocumentAccess } from './financial-document-helpers';
import { InvoicePdfService } from '../src/payments/invoice-pdf.service';
import { InvoicesService } from '../src/payments/invoices.service';
import { CreditNotePdfService } from '../src/payments/credit-note-pdf.service';
import { PaymentEffectsService } from '../src/payments/payment-effects.service';
import { ReceiptPdfService } from '../src/payments/receipt-pdf.service';
import { CommunicationsService } from '../src/communications/communications.service';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
  let adminId: string,
    requesterId: string,
    foreignCompanyId: string,
    foreignAdminId: string;
  let adminToken: string;
  let tenantAccountId: string;
  let invoiceId: string;
  let ownerId: string;
  let propertyId: string;

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
    adminId = adminUser.id;
    foreignCompanyId = (
      await createTestCompany(companyRepository, {
        name: 'Foreign payment recovery',
        taxId: `${uniqueId}-foreign-recovery`,
      })
    ).id;
    foreignAdminId = (
      await createActiveTestUser(usersService, {
        companyId: foreignCompanyId,
        role: UserRole.ADMIN,
        email: `foreign-${uniqueId}@payment-flow.test`,
        password: 'Password123!',
        firstName: 'Foreign',
        lastName: 'Admin',
      })
    ).id;
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
    requesterId = ownerUser.id;
    const owner = await ownerRepository.save(
      ownerRepository.create({ userId: ownerUser.id, companyId }),
    );
    ownerId = owner.id;

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
    propertyId = property.id;
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
      for (const table of [
        'pending_actions',
        'ai_tool_mutation_confirmations',
        'ai_conversations',
        'domain_operation_receipts',
      ])
        await dataSource.query(`DELETE FROM ${table} WHERE company_id=$1`, [
          companyId,
        ]);
      await dataSource.query(
        'DELETE FROM payment_effects_outbox WHERE company_id = $1::uuid',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM communication_deliveries WHERE company_id = $1::uuid',
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM payment_allocations WHERE company_id = $1::uuid',
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM bank_reconciliation_alerts WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM bank_reconciliations WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM bank_movements WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        `DELETE FROM documents WHERE company_id = $1::uuid`,
        [companyId],
      );
      await dataSource.query(
        'DELETE FROM credit_notes WHERE company_id = $1::uuid',
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
        `DELETE FROM bank_accounts WHERE company_id = $1::uuid`,
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
    if (foreignCompanyId) {
      for (const table of ['admins', 'users', 'companies'])
        await dataSource.query(
          `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}=$1`,
          [foreignCompanyId],
        );
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
    expect(confirmed.body.receipt.pdfUrl).toBeNull();
    expect(await app.get(PaymentEffectsService).processDue()).toMatchObject({
      completed: 1,
      failed: 0,
    });
    const ready = await request(app.getHttpServer())
      .get(`/payments/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(ready.body.receipt.pdfUrl).toMatch(/^db:\/\/document\//);

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
    expect(document.file_url).toBe(ready.body.receipt.pdfUrl);
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
    await verifyFinancialDocumentAccess(
      app,
      dataSource,
      adminToken,
      `/payments/${created.body.id}/receipt`,
      ready.body.receipt.pdfUrl,
    );
  });

  it('scopes invoice PDF bytes to the authorized invoice and verifies approval/hash', async () => {
    const invoice = await app
      .get(InvoicesService)
      .findOne(invoiceId, companyId);
    const url = await app.get(InvoicePdfService).generate(invoice);
    try {
      await invoiceRepository.update(invoiceId, { pdfUrl: url });
      await verifyFinancialDocumentAccess(
        app,
        dataSource,
        adminToken,
        `/invoices/${invoiceId}/pdf`,
        url,
      );
    } finally {
      await invoiceRepository.update(invoiceId, { pdfUrl: invoice.pdfUrl });
      await dataSource.query('DELETE FROM documents WHERE id=$1', [
        url.slice('db://document/'.length),
      ]);
    }
  });

  it('ingests an idempotent sandbox credit and reconciles it by virtual alias', async () => {
    expect.hasAssertions();

    const alias = `rent.${uniqueId}`.slice(0, 50);
    const account = await request(app.getHttpServer())
      .post('/bank-accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ownerId,
        propertyId,
        bankName: 'Sandbox Bank',
        accountType: 'virtual',
        accountNumber: `VIRTUAL-${uniqueId}`,
        alias,
        isVirtualAlias: true,
      })
      .expect(201);

    const reconciliationInvoice = await invoiceRepository.save(
      invoiceRepository.create({
        companyId,
        leaseId: (
          await tenantAccountRepository.findOneByOrFail({
            id: tenantAccountId,
          })
        ).leaseId,
        ownerId,
        tenantAccountId,
        invoiceNumber: `INV-RECON-${uniqueId}`,
        periodStart: new Date('2026-08-01'),
        periodEnd: new Date('2026-08-31'),
        issuedAt: new Date('2026-08-01'),
        dueDate: new Date('2026-08-10'),
        subtotal: 750,
        total: 750,
        balanceDue: 750,
        currencyCode: 'ARS',
        amountPaid: 0,
        status: InvoiceStatus.PENDING,
      }),
    );
    await dataSource.query(
      `UPDATE tenant_accounts SET current_balance = 750 WHERE id = $1::uuid`,
      [tenantAccountId],
    );

    const payload = {
      externalId: `sandbox-credit-${uniqueId}`,
      direction: 'credit',
      amount: 750,
      currency: 'ARS',
      occurredAt: '2026-08-10T14:00:00.000Z',
      description: `Transferencia recibida a ${alias}`,
      counterparty: 'Tenant Sandbox',
      rawPayload: { fixture: true },
    };
    const first = await request(app.getHttpServer())
      .post('/bank-reconciliation/sandbox/movements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(first.body).toMatchObject({
      invoiceId: reconciliationInvoice.id,
      matchStrategy: 'virtual_alias',
      status: 'matched',
      movement: {
        bankAccountId: account.body.id,
        externalId: payload.externalId,
        status: 'reconciled',
      },
      payment: {
        status: 'completed',
        method: PaymentMethod.BANK_TRANSFER,
      },
    });
    expect(first.body.payment.receipt.pdfUrl).toBeNull();
    expect(await app.get(PaymentEffectsService).processDue()).toMatchObject({
      completed: 1,
      failed: 0,
    });

    const retried = await request(app.getHttpServer())
      .post('/bank-reconciliation/sandbox/movements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(retried.body.id).toBe(first.body.id);
    expect(retried.body.paymentId).toBe(first.body.paymentId);

    const [counts] = await dataSource.query(
      `SELECT
         (SELECT COUNT(*) FROM bank_movements
          WHERE company_id = $1::uuid AND external_id = $2) AS movements,
         (SELECT COUNT(*) FROM payments
          WHERE company_id = $1::uuid AND reference_number = $3) AS payments`,
      [companyId, payload.externalId, `sandbox:${payload.externalId}`],
    );
    expect(Number(counts.movements)).toBe(1);
    expect(Number(counts.payments)).toBe(1);

    const refreshedInvoice = await invoiceRepository.findOneByOrFail({
      id: reconciliationInvoice.id,
    });
    expect(refreshedInvoice.status).toBe(InvoiceStatus.PAID);
    expect(Number(refreshedInvoice.amountPaid)).toBe(750);
  });

  async function confirmAnotherPayment() {
    const created = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantAccountId,
        amount: 10,
        currencyCode: 'ARS',
        paymentDate: '2026-09-28',
        method: PaymentMethod.CASH,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/payments/${created.body.id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return created.body.id as string;
  }

  it('rolls back the ledger and receipt if the outbox cannot be persisted', async () => {
    const created = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantAccountId,
        amount: 10,
        currencyCode: 'ARS',
        paymentDate: '2026-09-28',
        method: PaymentMethod.CASH,
      })
      .expect(201);
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const { PaymentsService } =
        await import('../src/payments/payments.service');
      const query = runner.manager.query.bind(runner.manager);
      jest
        .spyOn(runner.manager, 'query')
        .mockImplementation(async (sql, parameters) => {
          if (String(sql).includes('INSERT INTO payment_effects_outbox'))
            throw new Error('outbox unavailable');
          return query(sql, parameters);
        });
      await expect(
        app
          .get(PaymentsService)
          .confirmWithManager(runner.manager, created.body.id, companyId),
      ).rejects.toThrow('outbox unavailable');
      await runner.rollbackTransaction();
    } finally {
      await runner.release();
    }
    const [state] = await dataSource.query(
      `SELECT p.status,
      (SELECT count(*) FROM receipts WHERE payment_id = p.id) AS receipts,
      (SELECT count(*) FROM tenant_account_movements WHERE reference_id = p.id) AS movements
      FROM payments p WHERE p.id = $1`,
      [created.body.id],
    );
    expect(state).toEqual({ status: 'pending', receipts: '0', movements: '0' });
  });

  it('rolls back persisted PDF bytes on failure and recovers with one document and delivery', async () => {
    await dataSource.query(
      `UPDATE users SET phone = '5491112345678', whatsapp_enabled = true
      WHERE id IN (SELECT user_id FROM tenants WHERE company_id = $1)`,
      [companyId],
    );
    await dataSource.query(
      'UPDATE tenants SET contact_consent = true WHERE company_id = $1',
      [companyId],
    );
    const paymentId = await confirmAnotherPayment();
    const communications = app.get(CommunicationsService);
    const dispatch = communications.dispatchEvent.bind(communications);
    const failedDispatch = jest
      .spyOn(communications, 'dispatchEvent')
      .mockImplementationOnce(async (...args) => {
        await dispatch(...args);
        throw new Error('crash after document and delivery persistence');
      });
    try {
      expect(await app.get(PaymentEffectsService).processDue()).toMatchObject({
        failed: 1,
      });
    } finally {
      failedDispatch.mockRestore();
    }
    const [failed] = await dataSource.query(
      `SELECT e.status, e.attempts, r.pdf_url,
      (SELECT count(*) FROM documents WHERE entity_id = r.id) AS documents,
      (SELECT count(*) FROM communication_deliveries WHERE related_entity_id = e.payment_id) AS deliveries
      FROM payment_effects_outbox e JOIN receipts r ON r.payment_id = e.payment_id WHERE e.payment_id = $1`,
      [paymentId],
    );
    expect(failed).toEqual({
      status: 'queued',
      attempts: 1,
      pdf_url: null,
      documents: '0',
      deliveries: '0',
    });
    await dataSource.query(
      'UPDATE payment_effects_outbox SET next_attempt_at = NOW() WHERE payment_id = $1',
      [paymentId],
    );
    const outcomes = await Promise.all([
      app.get(PaymentEffectsService).processDue(),
      app.get(PaymentEffectsService).processDue(),
    ]);
    expect(outcomes.reduce((sum, result) => sum + result.completed, 0)).toBe(1);
    const [complete] = await dataSource.query(
      `SELECT e.status, e.attempts,
      (SELECT count(*) FROM documents WHERE entity_id = r.id) AS documents,
      (SELECT count(*) FROM communication_deliveries WHERE related_entity_id = e.payment_id) AS deliveries
      FROM payment_effects_outbox e JOIN receipts r ON r.payment_id = e.payment_id WHERE e.payment_id = $1`,
      [paymentId],
    );
    expect(complete).toEqual({
      status: 'completed',
      attempts: 2,
      documents: '1',
      deliveries: '1',
    });
    expect(await app.get(PaymentEffectsService).processDue()).toMatchObject({
      processed: 0,
    });
  });

  it('recovers receipt and late-fee credit note together when the second PDF fails', async () => {
    const source = await invoiceRepository.findOneByOrFail({ id: invoiceId });
    const lateInvoice = await invoiceRepository.save(
      invoiceRepository.create({
        companyId,
        leaseId: source.leaseId,
        ownerId,
        tenantAccountId,
        invoiceNumber: `INV-LATE-${uniqueId}`,
        periodStart: new Date('2026-09-01'),
        periodEnd: new Date('2026-09-30'),
        issuedAt: new Date('2026-09-01'),
        dueDate: new Date('2026-09-10'),
        subtotal: 5,
        lateFee: 5,
        total: 10,
        balanceDue: 10,
        currencyCode: 'ARS',
        amountPaid: 0,
        status: InvoiceStatus.OVERDUE,
      }),
    );
    const paymentId = await confirmAnotherPayment();
    const renderer = app.get(CreditNotePdfService);
    const render = renderer.generate.bind(renderer);
    const failure = jest
      .spyOn(renderer, 'generate')
      .mockImplementationOnce(async (...args) => {
        await render(...args);
        throw new Error('crash after credit note PDF');
      });
    try {
      expect(await app.get(PaymentEffectsService).processDue()).toMatchObject({
        failed: 1,
      });
    } finally {
      failure.mockRestore();
    }
    const [failed] = await dataSource.query(
      `SELECT r.pdf_url AS receipt, cn.pdf_url AS credit_note
      FROM receipts r JOIN credit_notes cn ON cn.payment_id = r.payment_id
      WHERE r.payment_id = $1 AND cn.invoice_id = $2`,
      [paymentId, lateInvoice.id],
    );
    expect(failed).toEqual({ receipt: null, credit_note: null });
    await dataSource.query(
      'UPDATE payment_effects_outbox SET next_attempt_at = NOW() WHERE payment_id = $1',
      [paymentId],
    );
    expect(await app.get(PaymentEffectsService).processDue()).toMatchObject({
      completed: 1,
      failed: 0,
    });
    const [result] = await dataSource.query(
      `SELECT r.pdf_url AS receipt, cn.id AS credit_note_id, cn.pdf_url AS credit_note,
      (SELECT count(*) FROM communication_deliveries WHERE related_entity_id = r.payment_id) AS deliveries
      FROM receipts r JOIN credit_notes cn ON cn.payment_id = r.payment_id
      WHERE r.payment_id = $1 AND cn.invoice_id = $2`,
      [paymentId, lateInvoice.id],
    );
    expect(result.receipt).toMatch(/^db:\/\/document\//);
    expect(result.credit_note).toMatch(/^db:\/\/document\//);
    expect(result.deliveries).toBe('2');
    await verifyFinancialDocumentAccess(
      app,
      dataSource,
      adminToken,
      `/invoices/credit-notes/${result.credit_note_id}/pdf`,
      result.credit_note,
    );
  });

  it('does not generate or queue a receipt when payment is cancelled before processing', async () => {
    const paymentId = await confirmAnotherPayment();
    await request(app.getHttpServer())
      .patch(`/payments/${paymentId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const generate = jest.spyOn(app.get(ReceiptPdfService), 'generate');
    try {
      expect(await app.get(PaymentEffectsService).processDue()).toMatchObject({
        completed: 1,
      });
      expect(generate).not.toHaveBeenCalled();
    } finally {
      generate.mockRestore();
    }
  });

  it('dead-letters persistent failures and protects the worker endpoint', async () => {
    const paymentId = await confirmAnotherPayment();
    const generate = jest
      .spyOn(app.get(ReceiptPdfService), 'generate')
      .mockRejectedValue(new Error('render failure'));
    try {
      for (let attempt = 1; attempt <= 5; attempt++) {
        await dataSource.query(
          'UPDATE payment_effects_outbox SET next_attempt_at = NOW() WHERE payment_id = $1',
          [paymentId],
        );
        expect(await app.get(PaymentEffectsService).processDue()).toMatchObject(
          { failed: 1 },
        );
      }
    } finally {
      generate.mockRestore();
    }
    const [dead] = await dataSource.query(
      'SELECT status, attempts FROM payment_effects_outbox WHERE payment_id = $1',
      [paymentId],
    );
    expect(dead).toEqual({ status: 'dead_letter', attempts: 5 });
    const previousToken = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'isolated-effects-token';
    try {
      await request(app.getHttpServer())
        .post('/payments/internal/process-effects')
        .expect(401);
      await request(app.getHttpServer())
        .post('/payments/internal/process-effects')
        .set('x-batch-communications-token', 'wrong')
        .expect(401);
      await request(app.getHttpServer())
        .post('/payments/internal/process-effects')
        .set('x-batch-communications-token', 'isolated-effects-token')
        .expect(201);
    } finally {
      if (previousToken === undefined)
        delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
      else process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = previousToken;
    }
  });

  it('protects batch retries and lets administrators review and resolve unmatched alerts', async () => {
    expect.hasAssertions();
    const internalToken = `bank-batch-${uniqueId}`;
    process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN = internalToken;

    const unmatched = await request(app.getHttpServer())
      .post('/bank-reconciliation/sandbox/movements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        externalId: `sandbox-unmatched-${uniqueId}`,
        direction: 'credit',
        amount: 987654.32,
        currency: 'ARS',
        occurredAt: '2026-08-15T14:00:00.000Z',
        description: 'Transferencia sin referencia identificable',
      })
      .expect(201);
    expect(unmatched.body.status).toBe('unmatched');

    await request(app.getHttpServer())
      .post(
        `/bank-reconciliation/internal/movements/${unmatched.body.movementId}/reconcile`,
      )
      .set('x-batch-bank-token', 'invalid-token')
      .expect(401);

    const retried = await request(app.getHttpServer())
      .post(
        `/bank-reconciliation/internal/movements/${unmatched.body.movementId}/reconcile`,
      )
      .set('x-batch-bank-token', internalToken)
      .expect(201);
    expect(retried.body).toMatchObject({
      id: unmatched.body.id,
      movementId: unmatched.body.movementId,
      status: 'unmatched',
    });

    const [alert] = await dataSource.query(
      `INSERT INTO bank_reconciliation_alerts (
         company_id, movement_id, reason, metadata
       ) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb)
       RETURNING id`,
      [
        companyId,
        unmatched.body.movementId,
        'No unique pending invoice matched the movement',
        JSON.stringify({ source: 'reconcile-bank-e2e' }),
      ],
    );

    const openAlerts = await request(app.getHttpServer())
      .get('/bank-reconciliation/alerts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(openAlerts.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: alert.id,
          movementId: unmatched.body.movementId,
          status: 'open',
        }),
      ]),
    );

    const resolved = await request(app.getHttpServer())
      .patch(`/bank-reconciliation/alerts/${alert.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(resolved.body).toMatchObject({ id: alert.id, status: 'resolved' });
    expect(resolved.body.resolvedAt).toBeTruthy();
    expect(resolved.body.resolvedBy).toBeTruthy();

    const resolvedAlerts = await request(app.getHttpServer())
      .get('/bank-reconciliation/alerts?status=resolved')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(resolvedAlerts.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: alert.id, status: 'resolved' }),
      ]),
    );
  });
  // Isolated account/invoice per recovery scenario; earlier accounting fixtures stay intact.
  async function recoveryFixture() {
    const account = await tenantAccountRepository.findOneByOrFail({
      id: tenantAccountId,
    });
    const property = await propertyRepository.save({
      companyId,
      ownerId,
      name: 'Recovery property',
      propertyType: PropertyType.APARTMENT,
      addressStreet: 'Recovery 100',
      addressCity: 'Buenos Aires',
      addressState: 'Buenos Aires',
    });
    const [lease] = await dataSource.query(
      `INSERT INTO leases(company_id,property_id,owner_id,tenant_id,contract_type,status,start_date,end_date,monthly_rent,currency)
      VALUES($1,$2,$3,$4,'rental','active','2026-01-01','2026-12-31',100,'ARS') RETURNING id`,
      [companyId, property.id, ownerId, account.tenantId],
    );
    const [fresh] = await dataSource.query(
      `INSERT INTO tenant_accounts(company_id,lease_id,tenant_id,current_balance,currency) VALUES($1,$2,$3,110,'ARS') RETURNING id`,
      [companyId, lease.id, account.tenantId],
    );
    const invoice = await invoiceRepository.save({
      companyId,
      leaseId: lease.id,
      ownerId,
      tenantAccountId: fresh.id,
      invoiceNumber: `REC-${randomUUID()}`,
      periodStart: new Date('2026-10-01T12:00:00Z'),
      periodEnd: new Date('2026-10-31T12:00:00Z'),
      dueDate: new Date('2026-11-10T12:00:00Z'),
      subtotal: 100,
      lateFee: 10,
      total: 110,
      amountPaid: 0,
      currencyCode: 'ARS',
      status: InvoiceStatus.PENDING,
    });
    return {
      accountId: fresh.id as string,
      invoiceId: invoice.id,
      dto: {
        tenantAccountId: fresh.id as string,
        amount: 110,
        currencyCode: 'ARS',
        paymentDate: '2026-11-10',
        method: PaymentMethod.CASH,
        items: [
          {
            description: 'Rent and fee',
            amount: 110,
            quantity: 1,
            type: PaymentItemType.CHARGE,
          },
        ],
      },
    };
  }

  it.each([
    ['post_payments', 'pending'],
    ['patch_payment_by_id', 'pending'],
    ['patch_payment_confirm', 'completed'],
    ['patch_payment_cancel', 'cancelled'],
  ])(
    'recovers approved %s after losing its committed response',
    async (toolName, status) => {
      const { accountId, dto } = await recoveryFixture();
      const service = app.get(PaymentsService);
      const payment =
        toolName === 'post_payments'
          ? undefined
          : await service.create(dto, adminId, companyId);
      if (toolName === 'patch_payment_cancel')
        await service.confirm(payment!.id, companyId);
      const payload =
        toolName === 'post_payments'
          ? dto
          : toolName === 'patch_payment_by_id'
            ? { id: payment!.id, notes: 'Approved edit' }
            : { id: payment!.id };
      const sort = (value: any): any =>
        Array.isArray(value)
          ? value.map(sort)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, item]) => [key, sort(item)]),
              )
            : value;
      const [action] = await dataSource.query(
        `INSERT INTO pending_actions(company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,expires_at)
      VALUES($1,$2,$3,'update','payment','Payment recovery',$4::jsonb,$5,now()+interval '15 minutes') RETURNING id,execution_key`,
        [
          companyId,
          requesterId,
          toolName,
          JSON.stringify(payload),
          createHash('sha256')
            .update(JSON.stringify(sort(payload)))
            .digest('hex'),
        ],
      );
      const reauthToken = (
        await request(app.getHttpServer())
          .post('/auth/reauthenticate')
          .auth(adminToken, { type: 'bearer' })
          .send({ password: 'Password123!' })
          .expect(200)
      ).body.reauthToken;
      const executor = app.get(AiToolExecutorService),
        original = executor.executeApproved.bind(executor),
        mode = process.env.AI_TOOLS_MODE;
      process.env.AI_TOOLS_MODE = 'FULL';
      const lost = jest
        .spyOn(executor, 'executeApproved')
        .mockImplementationOnce(async (...args) => {
          await original(...args);
          throw new Error('committed response lost');
        });
      const approve = () =>
        request(app.getHttpServer())
          .post(`/pending-actions/${action.id}/approve`)
          .auth(adminToken, { type: 'bearer' })
          .send({ reauthToken });
      try {
        expect((await approve().expect(201)).body.status).toBe('failed');
        lost.mockRestore();
        const [receipt] = await dataSource.query(
          'SELECT result FROM domain_operation_receipts WHERE company_id=$1 AND execution_key=$2',
          [companyId, action.execution_key],
        );
        expect(receipt.result.status).toBe(status);
        const id = receipt.result.id;
        if (status !== 'cancelled') await service.cancel(id, companyId);
        await dataSource.query(
          'UPDATE payments SET deleted_at=now() WHERE id=$1',
          [id],
        );
        const recovered = (await approve().expect(201)).body;
        expect(recovered.status).toBe('executed');
        expect(recovered.result).toMatchObject({ id, status });
        expect(recovered.result.items ?? []).toEqual(
          receipt.result.items ?? [],
        );
        expect(JSON.stringify(recovered.result)).not.toMatch(
          /passwordHash|passwordResetToken/,
        );
        const context = {
          companyId,
          userId: adminId,
          role: UserRole.ADMIN,
          idempotencyKey: action.execution_key,
        };
        expect(
          await Promise.all(
            Array.from({ length: 3 }, () =>
              executor.executeApproved(toolName, payload, context),
            ),
          ),
        ).toEqual([recovered.result, recovered.result, recovered.result]);
        await expect(
          executor.executeApproved(toolName, payload, {
            ...context,
            companyId: foreignCompanyId,
            userId: foreignAdminId,
          }),
        ).rejects.toThrow();
        await expect(
          executor.executeApproved(toolName, payload, {
            ...context,
            role: UserRole.TENANT,
          }),
        ).rejects.toThrow();
        const movements = await dataSource.query(
          'SELECT movement_type FROM tenant_account_movements WHERE tenant_account_id=$1',
          [accountId],
        );
        const completed = status !== 'pending';
        expect(
          movements.filter((r: any) => r.movement_type === 'payment'),
        ).toHaveLength(completed ? 1 : 0);
        expect(
          movements.filter((r: any) => r.movement_type === 'discount'),
        ).toHaveLength(completed ? 1 : 0);
        expect(
          movements.filter((r: any) => r.movement_type === 'adjustment'),
        ).toHaveLength(completed ? 2 : 0);
        expect(
          await dataSource.query(
            'SELECT id FROM receipts WHERE payment_id=$1',
            [id],
          ),
        ).toHaveLength(completed ? 1 : 0);
        expect(
          await dataSource.query(
            'SELECT id FROM payment_allocations WHERE payment_id=$1',
            [id],
          ),
        ).toHaveLength(completed ? 1 : 0);
        expect(
          await dataSource.query(
            'SELECT id FROM payment_effects_outbox WHERE payment_id=$1',
            [id],
          ),
        ).toHaveLength(completed ? 1 : 0);
        expect(
          (
            await dataSource.query(
              'SELECT current_balance::text FROM tenant_accounts WHERE id=$1',
              [accountId],
            )
          )[0].current_balance,
        ).toBe('110.00');
      } finally {
        lost.mockRestore();
        if (mode === undefined) delete process.env.AI_TOOLS_MODE;
        else process.env.AI_TOOLS_MODE = mode;
      }
    },
  );

  it.each(['create', 'update', 'confirm', 'cancel'])(
    'rolls back payment %s and every accounting effect if its recovery receipt cannot be saved',
    async (operation) => {
      const {
        accountId,
        invoiceId: freshInvoiceId,
        dto,
      } = await recoveryFixture();
      const service = app.get(PaymentsService),
        key = randomUUID();
      const payment =
        operation === 'create'
          ? undefined
          : await service.create(dto, adminId, companyId);
      if (operation === 'cancel') await service.confirm(payment!.id, companyId);
      const snapshot = async () => ({
        account: await dataSource.query(
          'SELECT * FROM tenant_accounts WHERE id=$1',
          [accountId],
        ),
        payments: await dataSource.query(
          'SELECT * FROM payments WHERE tenant_account_id=$1 ORDER BY id',
          [accountId],
        ),
        items: await dataSource.query(
          'SELECT * FROM payment_items WHERE payment_id IN (SELECT id FROM payments WHERE tenant_account_id=$1) ORDER BY id',
          [accountId],
        ),
        invoice: await dataSource.query('SELECT * FROM invoices WHERE id=$1', [
          freshInvoiceId,
        ]),
        movements: await dataSource.query(
          'SELECT * FROM tenant_account_movements WHERE tenant_account_id=$1 ORDER BY id',
          [accountId],
        ),
        allocations: await dataSource.query(
          'SELECT * FROM payment_allocations WHERE invoice_id=$1 ORDER BY id',
          [freshInvoiceId],
        ),
        notes: await dataSource.query(
          'SELECT * FROM credit_notes WHERE invoice_id=$1 ORDER BY id',
          [freshInvoiceId],
        ),
        receipts: await dataSource.query(
          'SELECT * FROM receipts WHERE payment_id IN (SELECT id FROM payments WHERE tenant_account_id=$1) ORDER BY id',
          [accountId],
        ),
        jobs: await dataSource.query(
          'SELECT * FROM payment_effects_outbox WHERE payment_id IN (SELECT id FROM payments WHERE tenant_account_id=$1) ORDER BY id',
          [accountId],
        ),
      });
      const before = await snapshot();
      const execute = () =>
        operation === 'create'
          ? service.create(dto, adminId, companyId, key)
          : operation === 'update'
            ? service.update(
                payment!.id,
                {
                  items: [
                    {
                      description: 'Adjusted',
                      amount: 120,
                      quantity: 1,
                      type: PaymentItemType.CHARGE,
                    },
                  ],
                },
                companyId,
                key,
              )
            : operation === 'confirm'
              ? service.confirm(payment!.id, companyId, key)
              : service.cancel(payment!.id, companyId, key);
      const original = EntityManager.prototype.query;
      const write = jest
        .spyOn(EntityManager.prototype, 'query')
        .mockImplementation(function (this: EntityManager, sql, parameters) {
          if (
            sql.includes('INSERT INTO domain_operation_receipts') &&
            parameters?.[0] === companyId
          )
            return Promise.reject(new Error('receipt persistence failed'));
          return original.call(this, sql, parameters);
        });
      try {
        await expect(execute()).rejects.toThrow('receipt persistence failed');
      } finally {
        write.mockRestore();
      }
      expect(await snapshot()).toEqual(before);
      expect(
        await dataSource.query(
          'SELECT execution_key FROM domain_operation_receipts WHERE company_id=$1 AND execution_key=$2',
          [companyId, key],
        ),
      ).toHaveLength(0);
      const result = await execute();
      expect(await execute()).toEqual(JSON.parse(JSON.stringify(result)));
    },
  );

  it('serializes concurrent approved payment creation including all its items', async () => {
    const { dto, accountId } = await recoveryFixture(),
      key = randomUUID(),
      service = app.get(PaymentsService);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.create(dto, adminId, companyId, key),
      ),
    );
    expect(new Set(results.map((p) => p.id)).size).toBe(1);
    expect(
      await dataSource.query(
        'SELECT id FROM payments WHERE tenant_account_id=$1',
        [accountId],
      ),
    ).toHaveLength(1);
    expect(
      await dataSource.query(
        'SELECT id FROM payment_items WHERE payment_id=$1',
        [results[0].id],
      ),
    ).toHaveLength(1);
    await expect(
      service.create(
        { ...dto, notes: 'Different request' },
        adminId,
        companyId,
        key,
      ),
    ).rejects.toThrow('different operation or request');
    await expect(
      service.confirm(results[0].id, companyId, key),
    ).rejects.toThrow('different operation or request');
  });
  it.each([true, false])(
    'keeps edited amount, concepts and confirmation consistent under concurrency (update first: %s)',
    async (updateFirst) => {
      const { dto, accountId } = await recoveryFixture(),
        service = app.get(PaymentsService);
      const payment = await service.create(dto, adminId, companyId);
      const edit = () =>
        service.update(
          payment.id,
          {
            items: [
              {
                description: 'Updated concepts',
                amount: 120,
                quantity: 1,
                type: PaymentItemType.CHARGE,
              },
            ],
          },
          companyId,
        );
      const confirm = () => service.confirm(payment.id, companyId);
      const outcomes = await Promise.allSettled(
        updateFirst ? [edit(), confirm()] : [confirm(), edit()],
      );
      const edited = outcomes[updateFirst ? 0 : 1],
        confirmed = outcomes[updateFirst ? 1 : 0];
      expect(confirmed.status).toBe('fulfilled');
      if (edited.status === 'rejected')
        expect(edited.reason.message).toBe(
          'Only pending payments can be edited',
        );
      const persisted = await service.findOne(payment.id, companyId);
      const expected = edited.status === 'fulfilled' ? 120 : 110;
      expect(persisted.status).toBe('completed');
      expect(Number(persisted.amount)).toBe(expected);
      expect(Number(persisted.receipt?.amount)).toBe(expected);
      expect(
        persisted.items.reduce(
          (sum, item) => sum + Number(item.amount) * item.quantity,
          0,
        ),
      ).toBe(expected);
      const [movement] = await dataSource.query(
        "SELECT amount::text FROM tenant_account_movements WHERE reference_id=$1 AND movement_type='payment'",
        [payment.id],
      );
      expect(Number(movement.amount)).toBe(-expected);
      await service.cancel(payment.id, companyId);
      expect(
        (
          await dataSource.query(
            'SELECT current_balance::text FROM tenant_accounts WHERE id=$1',
            [accountId],
          )
        )[0].current_balance,
      ).toBe('110.00');
    },
  );
  it('preserves omitted currency and activity in HTTP and approved AI edits, and applies amount when clearing concepts', async () => {
    const {
      dto,
      accountId,
      invoiceId: freshInvoiceId,
    } = await recoveryFixture();
    await dataSource.query(
      "INSERT INTO currencies(code,name,symbol,decimal_places,is_active) VALUES('USD','US Dollar','$',2,true) ON CONFLICT(code) DO NOTHING",
    );
    await dataSource.query(
      "UPDATE tenant_accounts SET currency='USD' WHERE id=$1",
      [accountId],
    );
    await dataSource.query("UPDATE invoices SET currency='USD' WHERE id=$1", [
      freshInvoiceId,
    ]);
    const created = await request(app.getHttpServer())
      .post('/payments')
      .auth(adminToken, { type: 'bearer' })
      .send({ ...dto, currencyCode: 'USD', activityType: 'annual' })
      .expect(201);
    const edited = await request(app.getHttpServer())
      .patch(`/payments/${created.body.id}`)
      .auth(adminToken, { type: 'bearer' })
      .send({ notes: 'HTTP notes' })
      .expect(200);
    expect(edited.body).toMatchObject({
      currencyCode: 'USD',
      activityType: 'annual',
      notes: 'HTTP notes',
    });
    const mode = process.env.AI_TOOLS_MODE;
    process.env.AI_TOOLS_MODE = 'FULL';
    try {
      const result = await app.get(AiToolExecutorService).executeApproved(
        'patch_payment_by_id',
        { id: created.body.id, notes: 'AI notes', items: [], amount: 115 },
        {
          userId: adminId,
          companyId,
          role: UserRole.ADMIN,
          idempotencyKey: randomUUID(),
        },
      );
      expect(result).toMatchObject({
        currencyCode: 'USD',
        activityType: 'annual',
        notes: 'AI notes',
        amount: '115.00',
        items: [],
      });
    } finally {
      if (mode === undefined) delete process.env.AI_TOOLS_MODE;
      else process.env.AI_TOOLS_MODE = mode;
    }
  });
  it('rejects inconsistent totals, fractional cents and account currencies before writing a payment', async () => {
    const { dto, accountId } = await recoveryFixture();
    for (const changes of [
      {
        amount: 110.02,
        items: [{ description: 'One cent mismatch', amount: 110.01 }],
      },
      { amount: 110.001, items: [] },
      {
        amount: 110.01,
        items: [{ description: 'Fractional cents', amount: 110.005 }],
      },
      { currencyCode: 'USD' },
    ]) {
      await request(app.getHttpServer())
        .post('/payments')
        .auth(adminToken, { type: 'bearer' })
        .send({ ...dto, ...changes })
        .expect(400);
    }
    expect(
      await dataSource.query(
        'SELECT id FROM payments WHERE tenant_account_id=$1',
        [accountId],
      ),
    ).toHaveLength(0);
  });

  it('requires matching concepts for amount-only edits and forbids moving a payment to another account or currency', async () => {
    const { dto } = await recoveryFixture(),
      service = app.get(PaymentsService);
    const payment = await service.create(dto, adminId, companyId);
    const before = await service.findOne(payment.id, companyId);
    const edit = (body: object) =>
      request(app.getHttpServer())
        .patch(`/payments/${payment.id}`)
        .auth(adminToken, { type: 'bearer' })
        .send(body);
    for (const body of [
      { amount: 111 },
      { currencyCode: 'USD' },
      { tenantAccountId: randomUUID() },
      { amount: 0.001, items: [] },
    ])
      await edit(body).expect(400);
    expect(await service.findOne(payment.id, companyId)).toEqual(before);
    await edit({ tenantAccountId: dto.tenantAccountId.toUpperCase() }).expect(
      200,
    );
    const replaced = await edit({
      items: [{ description: 'Corrected total', amount: 90 }],
    }).expect(200);
    expect(replaced.body.amount).toBe('90.00');
    expect((await edit({ amount: 90 }).expect(200)).body.items).toHaveLength(1);
    const cleared = await edit({ items: [], amount: 80 }).expect(200);
    expect(cleared.body).toMatchObject({ amount: '80.00', items: [] });
  });

  it.each(['currency', 'concepts', 'invoice currency'])(
    'rejects incompatible legacy %s on confirmation without any accounting effect',
    async (fault) => {
      const {
          dto,
          accountId,
          invoiceId: freshInvoiceId,
        } = await recoveryFixture(),
        service = app.get(PaymentsService);
      const payment = await service.create(dto, adminId, companyId),
        key = randomUUID();
      if (fault === 'currency')
        await dataSource.query(
          "UPDATE payments SET currency='USD' WHERE id=$1",
          [payment.id],
        );
      if (fault === 'concepts')
        await dataSource.query('UPDATE payments SET amount=111 WHERE id=$1', [
          payment.id,
        ]);
      if (fault === 'invoice currency')
        await dataSource.query(
          "UPDATE invoices SET currency='USD' WHERE id=$1",
          [freshInvoiceId],
        );
      await expect(service.confirm(payment.id, companyId, key)).rejects.toThrow(
        fault === 'concepts' ? 'does not match' : 'currency must match',
      );
      expect((await service.findOne(payment.id, companyId)).status).toBe(
        'pending',
      );
      expect(
        (
          await dataSource.query(
            'SELECT current_balance::text FROM tenant_accounts WHERE id=$1',
            [accountId],
          )
        )[0].current_balance,
      ).toBe('110.00');
      expect(
        await dataSource.query(
          'SELECT id FROM tenant_account_movements WHERE tenant_account_id=$1',
          [accountId],
        ),
      ).toHaveLength(0);
      for (const table of [
        'receipts',
        'payment_allocations',
        'credit_notes',
        'payment_effects_outbox',
      ])
        expect(
          await dataSource.query(
            `SELECT id FROM ${table} WHERE payment_id=$1`,
            [payment.id],
          ),
        ).toHaveLength(0);
      expect(
        await dataSource.query(
          'SELECT execution_key FROM domain_operation_receipts WHERE company_id=$1 AND execution_key=$2',
          [companyId, key],
        ),
      ).toHaveLength(0);
      await dataSource.query(
        "UPDATE payments SET currency='ARS',amount=110 WHERE id=$1",
        [payment.id],
      );
      await dataSource.query("UPDATE invoices SET currency='ARS' WHERE id=$1", [
        freshInvoiceId,
      ]);
      expect((await service.confirm(payment.id, companyId, key)).status).toBe(
        'completed',
      );
    },
  );

  it('settles fractional payments in exact cents instead of leaving a fully paid invoice partial', async () => {
    const {
        dto,
        accountId,
        invoiceId: freshInvoiceId,
      } = await recoveryFixture(),
      service = app.get(PaymentsService);
    await dataSource.query(
      'UPDATE invoices SET subtotal=0.80,late_fee_amount=0,total_amount=0.80 WHERE id=$1',
      [freshInvoiceId],
    );
    await dataSource.query(
      'UPDATE tenant_accounts SET current_balance=0.80 WHERE id=$1',
      [accountId],
    );
    for (const amount of [0.1, 0.7]) {
      const payment = await service.create(
        {
          ...dto,
          amount,
          items: [
            {
              description: 'Partial payment',
              amount,
              type: PaymentItemType.CHARGE,
            },
          ],
        },
        adminId,
        companyId,
      );
      await service.confirm(payment.id, companyId);
    }
    expect(
      (
        await dataSource.query(
          'SELECT paid_amount::text AS amount_paid,status FROM invoices WHERE id=$1',
          [freshInvoiceId],
        )
      )[0],
    ).toEqual({ amount_paid: '0.80', status: 'paid' });
    expect(
      (
        await dataSource.query(
          'SELECT current_balance::text FROM tenant_accounts WHERE id=$1',
          [accountId],
        )
      )[0].current_balance,
    ).toBe('0.00');
    expect(
      (
        await dataSource.query(
          'SELECT sum(amount)::text AS amount FROM payment_allocations WHERE invoice_id=$1',
          [freshInvoiceId],
        )
      )[0].amount,
    ).toBe('0.80');
  });
});
