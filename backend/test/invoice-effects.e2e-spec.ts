import { createHash, randomUUID } from 'node:crypto';
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
import { UserRole } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';
import { InvoiceEffectsService } from '../src/payments/invoice-effects.service';
import { InvoicePdfService } from '../src/payments/invoice-pdf.service';
import { InvoicesService } from '../src/payments/invoices.service';
import { buildAiToolDefinitions } from '../src/ai/openai-tools.registry';
import { ProviderHttpService } from '../src/integrations/provider-http.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Durable issued invoice documents (e2e)', () => {
  let app: INestApplication, db: DataSource, worker: InvoiceEffectsService;
  let companyId: string,
    foreignId: string,
    userId: string,
    propertyId: string,
    ownerId: string,
    tenantId: string,
    _buyerId: string;
  let token: string, foreignToken: string, tenantToken: string;
  let network: jest.SpyInstance;
  const suffix = randomUUID().slice(0, 12),
    password = 'ContractsTest123!';
  const oldBatchToken = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
  const oldFrontendUrl = process.env.FRONTEND_URL;
  beforeAll(async () => {
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'contracts-test-token';
    process.env.FRONTEND_URL = 'https://rent.test';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    worker = app.get(InvoiceEffectsService);
    const companies = db.getRepository(Company);
    companyId = (
      await createTestCompany(companies, {
        name: 'Contract effects',
        taxId: `contract-${suffix}`,
      })
    ).id;
    foreignId = (
      await createTestCompany(companies, {
        name: 'Foreign contracts',
        taxId: `contract-foreign-${suffix}`,
      })
    ).id;
    const create = async (company: string, role: UserRole) => {
      const user = await createActiveTestUser(app.get(UsersService), {
        companyId: company,
        role,
        email: `${company}-${role}-${suffix}@contracts.test`,
        password,
        firstName: 'Contract',
        lastName: 'Fixture',
      });
      return { user, token: await loginTestUser(app, user.email!, password) };
    };
    const admin = await create(companyId, UserRole.ADMIN);
    userId = admin.user.id;
    token = admin.token;
    foreignToken = (await create(foreignId, UserRole.ADMIN)).token;
    const tenantUser = await create(companyId, UserRole.TENANT);
    tenantToken = tenantUser.token;
    ownerId = (
      await db.query(
        'INSERT INTO owners(company_id,user_id,commission_rate) VALUES($1,$2,10) RETURNING id',
        [companyId, userId],
      )
    )[0].id;
    tenantId = (
      await db.query('SELECT id FROM tenants WHERE user_id=$1', [
        tenantUser.user.id,
      ])
    )[0]?.id;
    if (!tenantId)
      tenantId = (
        await db.query(
          'INSERT INTO tenants(company_id,user_id) VALUES($1,$2) RETURNING id',
          [companyId, tenantUser.user.id],
        )
      )[0].id;
    _buyerId = (
      await db.query(
        'INSERT INTO buyers(company_id,user_id) VALUES($1,$2) RETURNING id',
        [companyId, userId],
      )
    )[0].id;
    propertyId = (
      await db.getRepository(Property).save({
        companyId,
        ownerId,
        name: 'Contract property',
        propertyType: PropertyType.APARTMENT,
        addressStreet: 'Test 100',
        addressCity: 'Buenos Aires',
        addressState: 'Buenos Aires',
      })
    ).id;
    network = jest
      .spyOn(app.get(ProviderHttpService), 'request')
      .mockRejectedValue(new Error('Unexpected provider request'));
  });
  const clear = async () => {
    await db.query(
      'DELETE FROM tenant_account_movements WHERE tenant_account_id IN (SELECT id FROM tenant_accounts WHERE company_id=$1)',
      [companyId],
    );
    await db.query(
      'DELETE FROM payment_document_templates WHERE company_id=$1',
      [companyId],
    );
    for (const table of [
      'invoice_effects_outbox',
      'commission_invoices',
      'invoices',
      'documents',
      'tenant_accounts',
      'leases',
    ])
      await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [companyId]);
    await db.query(
      "UPDATE properties SET operation_state='available' WHERE id=$1",
      [propertyId],
    );
  };
  beforeEach(async () => {
    await clear();
    network.mockClear();
  });
  afterEach(() => {
    if (network) expect(network).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (companyId) {
      await clear();
      for (const table of ['properties', 'buyers', 'tenants', 'owners'])
        await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [companyId]);
    }
    for (const id of [companyId, foreignId].filter(Boolean)) {
      for (const table of ['admins', 'users', 'companies'])
        await db.query(
          `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}=$1`,
          [id],
        );
    }
    await app?.close();
    if (oldBatchToken === undefined)
      delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    else process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = oldBatchToken;
    if (oldFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = oldFrontendUrl;
  });
  const seed = async () => {
    const [lease] = await db.query(
      `INSERT INTO leases(company_id,property_id,owner_id,tenant_id,contract_type,status,start_date,end_date,monthly_rent,currency)
      VALUES($1,$2,$3,$4,'rental','active','2026-09-01','2027-09-01',1000,'ARS') RETURNING id`,
      [companyId, propertyId, ownerId, tenantId],
    );
    const [account] = await db.query(
      "INSERT INTO tenant_accounts(company_id,lease_id,tenant_id,current_balance,currency) VALUES($1,$2,$3,0,'ARS') RETURNING id",
      [companyId, lease.id, tenantId],
    );
    const created = await request(app.getHttpServer())
      .post('/invoices')
      .auth(token, { type: 'bearer' })
      .send({
        leaseId: lease.id,
        invoiceNumber: `INV-${randomUUID().slice(0, 8)}`,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        dueDate: '2026-10-10',
        subtotal: 1000,
      })
      .expect(201);
    return {
      id: created.body.id as string,
      leaseId: lease.id,
      accountId: account.id,
    };
  };
  const issue = (id: string, auth = token) =>
    request(app.getHttpServer())
      .patch(`/invoices/${id}/issue`)
      .auth(auth, { type: 'bearer' })
      .send({});
  const jobs = () =>
    db.query('SELECT * FROM invoice_effects_outbox WHERE company_id=$1', [
      companyId,
    ]);
  const status = (id: string, auth = token) =>
    request(app.getHttpServer())
      .get(`/invoices/${id}/document-status`)
      .auth(auth, { type: 'bearer' });
  const pdf = (id: string, auth = token) =>
    request(app.getHttpServer())
      .get(`/invoices/${id}/pdf`)
      .auth(auth, { type: 'bearer' });
  const due = () =>
    db.query(
      'UPDATE invoice_effects_outbox SET next_attempt_at=now() WHERE company_id=$1',
      [companyId],
    );

  it('queues issuance atomically, survives concurrent workers and scopes status/downloads', async () => {
    const { id } = await seed();
    await issue(id, foreignToken).expect(404);
    await issue(id, tenantToken).expect(403);
    const render = jest.spyOn(app.get(InvoicePdfService), 'generateSnapshot');
    const results = await Promise.all([issue(id), issue(id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(render).not.toHaveBeenCalled();
    expect(await jobs()).toHaveLength(1);
    expect((await status(id).expect(200)).body).toEqual({
      available: false,
      status: 'queued',
    });
    await status(id, foreignToken).expect(404);
    await status(id, tenantToken).expect(200);
    await pdf(id).expect(404);
    const [movement] = await db.query(
      "SELECT count(*) FROM tenant_account_movements WHERE reference_id=$1 AND movement_type='charge'",
      [id],
    );
    expect(movement.count).toBe('1');
    const processed = await Promise.all([
      worker.processDue(),
      worker.processDue(),
    ]);
    expect(processed.reduce((n, r) => n + r.completed, 0)).toBe(1);
    expect(render).toHaveBeenCalledTimes(1);
    render.mockRestore();
    expect((await status(id).expect(200)).body).toEqual({
      available: true,
      status: 'completed',
    });
    const response = await pdf(id, tenantToken).expect(200);
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    await pdf(id, foreignToken).expect(404);
    const [document] = await db.query(
      'SELECT file_data,metadata FROM documents WHERE entity_id=$1',
      [id],
    );
    expect(document.metadata.sha256).toBe(
      createHash('sha256').update(document.file_data).digest('hex'),
    );
    expect((await worker.processDue()).processed).toBe(0);
  });

  it('rolls back invoice, account and commission if the durable snapshot cannot be captured', async () => {
    const { id, accountId } = await seed();
    const capture = jest
      .spyOn(app.get(InvoicePdfService), 'captureSnapshot')
      .mockRejectedValueOnce(new Error('snapshot unavailable'));
    await expect(app.get(InvoicesService).issue(id, companyId)).rejects.toThrow(
      'snapshot unavailable',
    );
    capture.mockRestore();
    expect(await jobs()).toHaveLength(0);
    const [row] = await db.query(
      'SELECT status,pdf_url FROM invoices WHERE id=$1',
      [id],
    );
    expect(row).toEqual({ status: 'draft', pdf_url: null });
    const [account] = await db.query(
      'SELECT current_balance AS balance FROM tenant_accounts WHERE id=$1',
      [accountId],
    );
    expect(Number(account.balance)).toBe(0);
    expect(
      await db.query(
        'SELECT id FROM tenant_account_movements WHERE reference_id=$1',
        [id],
      ),
    ).toHaveLength(0);
    expect(
      await db.query(
        "SELECT id FROM commission_invoices WHERE related_invoices @> jsonb_build_array(jsonb_build_object('invoiceId',$1::text))",
        [id],
      ),
    ).toHaveLength(0);
  });

  it('rolls back persisted bytes after a worker failure and retries without duplicates', async () => {
    const { id } = await seed();
    await issue(id).expect(200);
    const service = app.get(InvoicePdfService),
      original = service.generateSnapshot.bind(service);
    const render = jest
      .spyOn(service, 'generateSnapshot')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error('after document write');
      });
    expect((await worker.processDue()).failed).toBe(1);
    render.mockRestore();
    expect(
      await db.query('SELECT id FROM documents WHERE entity_id=$1', [id]),
    ).toHaveLength(0);
    expect((await jobs())[0]).toMatchObject({
      status: 'queued',
      attempts: 1,
      document_id: null,
    });
    await due();
    expect((await worker.processDue()).completed).toBe(1);
    expect(
      await db.query('SELECT id FROM documents WHERE entity_id=$1', [id]),
    ).toHaveLength(1);
  });

  it('retains failed work in dead letter after five attempts and exposes that state', async () => {
    const { id } = await seed();
    await issue(id).expect(200);
    const render = jest
      .spyOn(app.get(InvoicePdfService), 'generateSnapshot')
      .mockRejectedValue(new Error('renderer unavailable'));
    try {
      for (let i = 0; i < 5; i++) {
        await due();
        expect((await worker.processDue()).failed).toBe(1);
      }
    } finally {
      render.mockRestore();
    }
    expect((await status(id).expect(200)).body).toEqual({
      available: false,
      status: 'dead_letter',
    });
    expect((await worker.processDue()).processed).toBe(0);
    expect((await jobs())[0]).toMatchObject({
      attempts: 5,
      status: 'dead_letter',
    });
  });

  it('uses the issued parties and template snapshot after cancellation and later edits', async () => {
    const { id } = await seed();
    await db.query(
      `INSERT INTO payment_document_templates(company_id,type,name,template_body,is_default,is_active) VALUES($1,'invoice','Snapshot','Original {{tenant.fullName}} {{invoice.total}} {{invoice.periodStart}} {{today}}',true,true)`,
      [companyId],
    );
    await issue(id).expect(200);
    const job = (await jobs())[0];
    expect(JSON.stringify(job.snapshot)).not.toContain('password');
    await db.query(
      "UPDATE payment_document_templates SET template_body='Changed template' WHERE company_id=$1",
      [companyId],
    );
    const [tenant] = await db.query('SELECT user_id FROM tenants WHERE id=$1', [
      tenantId,
    ]);
    await db.query("UPDATE users SET first_name='Changed name' WHERE id=$1", [
      tenant.user_id,
    ]);
    await request(app.getHttpServer())
      .patch(`/invoices/${id}/cancel`)
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(200);
    const render = jest.spyOn(app.get(InvoicePdfService), 'generateSnapshot');
    expect((await worker.processDue()).completed).toBe(1);
    expect(render.mock.calls[0][0]).toEqual(job.snapshot);
    render.mockRestore();
    await pdf(id).expect(200);
    await expect(
      db.query(
        "UPDATE invoice_effects_outbox SET snapshot='{}' WHERE invoice_id=$1",
        [id],
      ),
    ).rejects.toThrow('immutable');
    await expect(
      db.query('UPDATE invoices SET total_amount=99 WHERE id=$1', [id]),
    ).rejects.toThrow('requires a correction');
    await db.query(
      "UPDATE documents SET status='rejected' WHERE entity_id=$1",
      [id],
    );
    expect((await status(id).expect(200)).body).toEqual({
      available: false,
      status: 'unavailable',
    });
    await pdf(id).expect(404);
    await db.query(
      'DELETE FROM payment_document_templates WHERE company_id=$1',
      [companyId],
    );
    await db.query("UPDATE users SET first_name='Contract' WHERE id=$1", [
      tenant.user_id,
    ]);
  });

  it('queues monthly auto-issuance and the IA tool through the same domain transaction', async () => {
    const { id, leaseId } = await seed();
    const tool = buildAiToolDefinitions({
      invoicesService: app.get(InvoicesService),
    } as any).find((t) => t.name === 'patch_invoice_issue')!;
    await tool.execute({ id }, {
      companyId,
      userId,
      role: UserRole.ADMIN,
    } as any);
    await request(app.getHttpServer())
      .post(`/invoices/lease/${leaseId}/generate`)
      .auth(token, { type: 'bearer' })
      .send({ issue: true })
      .expect(201);
    expect(await jobs()).toHaveLength(2);
    expect(
      await db.query('SELECT id FROM documents WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(0);
  });

  it('requires the batch credential to process documents', async () => {
    await request(app.getHttpServer())
      .post('/invoices/internal/process-documents')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/invoices/internal/process-documents')
      .set('x-batch-communications-token', 'contracts-test-token')
      .send({})
      .expect(201);
  });
});
