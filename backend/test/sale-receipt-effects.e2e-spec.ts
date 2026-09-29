import { UserRole } from '../src/users/entities/user.entity';
import { Owner } from '../src/owners/entities/owner.entity';
import { Buyer } from '../src/buyers/entities/buyer.entity';
import {
  Property,
  PropertyType,
} from '../src/properties/entities/property.entity';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, EntityManager } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { Admin } from '../src/users/entities/admin.entity';
import { UsersService } from '../src/users/users.service';
import { SaleFolder } from '../src/sales/entities/sale-folder.entity';
import { SaleAgreement } from '../src/sales/entities/sale-agreement.entity';
import { SalesService } from '../src/sales/sales.service';
import { SaleReceiptEffectsService } from '../src/sales/sale-receipt-effects.service';
import { SaleReceiptPdfService } from '../src/sales/sale-receipt-pdf.service';
import {
  createActiveTestUser,
  configureE2eApp,
  createTestCompany,
  createSuperAdminTestUser,
  loginTestUser,
} from './e2e-helpers';

describe('Durable sale receipts (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let companyId: string;
  let foreignId: string;
  let token: string;
  let foreignToken: string;
  let agreementId: string;
  let receiptId: string;
  const password = 'SalesTest123!';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dto = { amount: 100, paymentDate: '2026-09-15' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    ds = app.get(DataSource);
    const companies = ds.getRepository(Company);
    companyId = (
      await createTestCompany(companies, {
        name: 'Sale Effects',
        taxId: `sales-${unique}`,
      })
    ).id;
    foreignId = (
      await createTestCompany(companies, {
        name: 'Other Sales',
        taxId: `other-${unique}`,
      })
    ).id;
    const makeToken = async (id: string, suffix: string) => {
      const email = `sales-${suffix}-${unique}@example.com`;
      await createSuperAdminTestUser(
        app.get(UsersService),
        ds.getRepository(Admin),
        {
          email,
          password,
          firstName: 'Sales',
          lastName: 'Test',
          companyId: id,
        },
      );
      return loginTestUser(app, email, password);
    };
    token = await makeToken(companyId, 'own');
    foreignToken = await makeToken(foreignId, 'other');
    const folder = await ds
      .getRepository(SaleFolder)
      .save({ companyId, name: 'Sales' });
    const ownerUser = await createActiveTestUser(app.get(UsersService), {
      email: `owner-${unique}@example.com`,
      password,
      firstName: 'Sale',
      lastName: 'Owner',
      role: UserRole.OWNER,
      companyId,
    });
    const buyerUser = await createActiveTestUser(app.get(UsersService), {
      email: `buyer-${unique}@example.com`,
      password,
      firstName: 'Sale',
      lastName: 'Buyer',
      role: UserRole.BUYER,
      companyId,
    });
    const owner = await ds
      .getRepository(Owner)
      .save({ userId: ownerUser.id, companyId });
    const buyer = await ds
      .getRepository(Buyer)
      .save({ userId: buyerUser.id, companyId });
    const property = await ds.getRepository(Property).save({
      companyId,
      ownerId: owner.id,
      name: 'Sale Test Apartment',
      propertyType: PropertyType.APARTMENT,
      addressStreet: 'Test 100',
      addressCity: 'Buenos Aires',
      addressState: 'Buenos Aires',
    });
    const agreement = await app.get(SalesService).createAgreement(
      {
        folderId: folder.id,
        propertyId: property.id,
        buyerId: buyer.id,
        totalAmount: 1000,
        currency: 'ARS',
        installmentAmount: 100,
        installmentCount: 10,
        startDate: '2026-01-01',
        dueDay: 10,
      },
      { companyId },
    );
    agreementId = agreement.id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (companyId) {
      await ds.query(
        'DELETE FROM sale_receipt_effects_outbox WHERE company_id = $1',
        [companyId],
      );
      await ds.query('DELETE FROM documents WHERE company_id = $1', [
        companyId,
      ]);
      await ds.query('DELETE FROM sale_receipts WHERE agreement_id = $1', [
        agreementId,
      ]);
      await ds.query('DELETE FROM sale_agreements WHERE company_id = $1', [
        companyId,
      ]);
      await ds.query('DELETE FROM sale_folders WHERE company_id = $1', [
        companyId,
      ]);
    }
    for (const id of [companyId, foreignId].filter(Boolean)) {
      await ds.query('DELETE FROM leases WHERE company_id = $1', [id]);
      await ds.query('DELETE FROM properties WHERE company_id = $1', [id]);
      await ds.query('DELETE FROM buyers WHERE company_id = $1', [id]);
      await ds.query('DELETE FROM owners WHERE company_id = $1', [id]);
      await ds.query('DELETE FROM admins WHERE company_id = $1', [id]);
      await ds.query('DELETE FROM users WHERE company_id = $1', [id]);
      await ds.query('DELETE FROM companies WHERE id = $1', [id]);
    }
    await app?.close();
  });

  const createReceipt = () =>
    app.get(SalesService).createReceipt(agreementId, dto, { companyId });
  const state = async (id: string) =>
    (
      await ds.query(
        `SELECT r.pdf_url, e.status, e.attempts,
      (SELECT count(*)::integer FROM documents d WHERE d.entity_id = r.id AND d.entity_type = 'sale_receipt') AS documents
     FROM sale_receipts r JOIN sale_receipt_effects_outbox e ON e.receipt_id = r.id WHERE r.id = $1`,
        [id],
      )
    )[0];
  const retry = () =>
    ds.query(
      'UPDATE sale_receipt_effects_outbox SET next_attempt_at = NOW() WHERE company_id = $1',
      [companyId],
    );

  it('serializes concurrent payments and commits one task for each receipt', async () => {
    const receipts = await Promise.all([createReceipt(), createReceipt()]);
    receiptId = receipts[0].id;
    expect(new Set(receipts.map((r) => r.receiptNumber)).size).toBe(2);
    expect(receipts.map((r) => Number(r.balanceAfter)).sort()).toEqual([
      800, 900,
    ]);
    expect(
      Number(
        (
          await ds
            .getRepository(SaleAgreement)
            .findOneByOrFail({ id: agreementId })
        ).paidAmount,
      ),
    ).toBe(200);
    for (const receipt of receipts)
      expect(await state(receipt.id)).toMatchObject({
        pdf_url: null,
        status: 'queued',
        documents: 0,
      });
  });

  it('rolls back both payment balance and receipt when saving its task fails', async () => {
    const original = EntityManager.prototype.query;
    const spy = jest
      .spyOn(EntityManager.prototype, 'query')
      .mockImplementation(async function (
        this: EntityManager,
        sql,
        parameters,
      ) {
        if (String(sql).includes('INSERT INTO sale_receipt_effects_outbox'))
          throw new Error('outbox unavailable');
        return original.call(this, sql, parameters);
      });
    try {
      await expect(createReceipt()).rejects.toThrow('outbox unavailable');
    } finally {
      spy.mockRestore();
    }
    const [row] = await ds.query(
      'SELECT paid_amount, (SELECT count(*)::integer FROM sale_receipts WHERE agreement_id = $1) AS receipts FROM sale_agreements WHERE id = $1',
      [agreementId],
    );
    expect(row).toEqual({ paid_amount: '200.00', receipts: 2 });
  });

  it('rolls back PDF bytes if the worker fails after rendering and then recovers', async () => {
    const pdf = app.get(SaleReceiptPdfService);
    const generate = pdf.generate.bind(pdf);
    const spy = jest
      .spyOn(pdf, 'generate')
      .mockImplementation(async (...args) => {
        await generate(...args);
        throw new Error('failure after PDF persistence');
      });
    try {
      expect(
        (await app.get(SaleReceiptEffectsService).processDue()).failed,
      ).toBe(2);
    } finally {
      spy.mockRestore();
    }
    expect(await state(receiptId)).toMatchObject({
      pdf_url: null,
      status: 'queued',
      attempts: 1,
      documents: 0,
    });
    await retry();
    await Promise.all([
      app.get(SaleReceiptEffectsService).processDue(),
      app.get(SaleReceiptEffectsService).processDue(),
    ]);
    expect(await state(receiptId)).toMatchObject({
      status: 'completed',
      attempts: 2,
      documents: 1,
    });
  });

  it('replays a completed task without duplicating its PDF', async () => {
    const before = await state(receiptId);
    await ds.query(
      "UPDATE sale_receipt_effects_outbox SET status = 'queued', next_attempt_at = NOW() WHERE receipt_id = $1",
      [receiptId],
    );
    await app.get(SaleReceiptEffectsService).processDue();
    expect(await state(receiptId)).toMatchObject({
      pdf_url: before.pdf_url,
      documents: 1,
      status: 'completed',
    });
  });

  it('authorizes PDF downloads and persists an original plus duplicate', async () => {
    await request(app.getHttpServer())
      .get(`/sales/receipts/${receiptId}/pdf`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/sales/receipts/${receiptId}/pdf`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(`/sales/receipts/${receiptId}/pdf`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      response.body.toString('latin1').match(/\/Type \/Page\b/g),
    ).toHaveLength(2);
    await request(app.getHttpServer())
      .post(`/sales/agreements/${agreementId}/receipts`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send(dto)
      .expect(404);
  });

  it('dead-letters repeated failures after five attempts without leaving PDF bytes', async () => {
    const receipt = await createReceipt();
    const spy = jest
      .spyOn(app.get(SaleReceiptPdfService), 'generate')
      .mockRejectedValue(new Error('unavailable'));
    try {
      for (let i = 0; i < 5; i++) {
        await retry();
        await app.get(SaleReceiptEffectsService).processDue();
      }
    } finally {
      spy.mockRestore();
    }
    expect(await state(receipt.id)).toMatchObject({
      pdf_url: null,
      documents: 0,
      status: 'dead_letter',
      attempts: 5,
    });
  });

  it('requires the internal batch credential', async () => {
    const previous = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'sale-effects-test-token';
    try {
      await request(app.getHttpServer())
        .post('/sales/internal/process-receipts')
        .expect(401);
      await request(app.getHttpServer())
        .post('/sales/internal/process-receipts')
        .set('x-batch-communications-token', 'wrong')
        .expect(401);
      await request(app.getHttpServer())
        .post('/sales/internal/process-receipts')
        .set('x-batch-communications-token', 'sale-effects-test-token')
        .expect(201);
    } finally {
      if (previous === undefined)
        delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
      else process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = previous;
    }
  });
});
