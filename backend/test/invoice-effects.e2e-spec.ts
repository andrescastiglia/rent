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
import { ScheduledBillingService } from '../src/payments/scheduled-billing.service';
import { CommunicationsService } from '../src/communications/communications.service';
import { WhatsappService } from '../src/whatsapp/whatsapp.service';
import { AiToolExecutorService } from '../src/ai/ai-tool-executor.service';
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
  const oldBillingToken = process.env.BATCH_BILLING_INTERNAL_TOKEN;
  const oldFrontendUrl = process.env.FRONTEND_URL;
  beforeAll(async () => {
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'contracts-test-token';
    process.env.BATCH_BILLING_INTERNAL_TOKEN = 'billing-test-token';
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
  const observationIds: string[] = [];
  const clear = async () => {
    if (observationIds.length)
      await db.query(
        'DELETE FROM inflation_observations WHERE id=ANY($1::uuid[])',
        [observationIds.splice(0)],
      );
    await db.query(
      'DELETE FROM tenant_account_movements WHERE tenant_account_id IN (SELECT id FROM tenant_accounts WHERE company_id=$1)',
      [companyId],
    );
    await db.query(
      'DELETE FROM payment_document_templates WHERE company_id=$1',
      [companyId],
    );
    for (const table of [
      'pending_actions',
      'ai_tool_mutation_confirmations',
      'ai_conversations',
      'communication_deliveries',
      'invoice_generations',
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
    await db.query('UPDATE tenants SET contact_consent=false WHERE id=$1', [
      tenantId,
    ]);
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
    if (oldBillingToken === undefined)
      delete process.env.BATCH_BILLING_INTERNAL_TOKEN;
    else process.env.BATCH_BILLING_INTERNAL_TOKEN = oldBillingToken;
    if (oldFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = oldFrontendUrl;
  });
  const seed = async (property = propertyId, owner = ownerId) => {
    const [lease] = await db.query(
      `INSERT INTO leases(company_id,property_id,owner_id,tenant_id,contract_type,status,start_date,end_date,monthly_rent,currency)
      VALUES($1,$2,$3,$4,'rental','active','2026-09-01','2027-09-01',1000,'ARS') RETURNING id`,
      [companyId, property, owner, tenantId],
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
    await db.query(
      "UPDATE leases SET next_billing_date='2026-10-01' WHERE id=$1",
      [leaseId],
    );
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

  const generate = (
    leaseId: string,
    body: Record<string, unknown> = {},
    auth = token,
  ) =>
    request(app.getHttpServer())
      .post(`/invoices/lease/${leaseId}/generate`)
      .auth(auth, { type: 'bearer' })
      .send(body);
  const october = {
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    dueDate: '2026-11-10',
  };

  const addObservation = async (
    index: string,
    date: string,
    value: string,
    revision = 1,
  ) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO inflation_observations(id,index_type,observation_date,value,value_kind,source,source_series,source_url,revision,retrieved_at)
      VALUES($1,$2,$3,$4,$5,'invoice fixture','fixture','https://example.test',$6,now())`,
      [
        id,
        index,
        date,
        value,
        index === 'igp_m' ? 'monthly_percent' : 'level',
        revision,
      ],
    );
    observationIds.push(id);
    return id;
  };
  const april = {
    periodStart: '2088-04-01',
    periodEnd: '2088-04-30',
    dueDate: '2088-05-10',
  };
  const indexedLease = async (index: string, lag: number | null) => {
    const seeded = await seed();
    await db.query(
      `UPDATE leases SET start_date='2088-01-01',end_date='2089-01-01',next_billing_date='2088-04-01',
      next_adjustment_date='2088-04-01',adjustment_type='inflation_index',inflation_index_type=$2,inflation_index_lag_months=$3,adjustment_frequency_months=3 WHERE id=$1`,
      [seeded.leaseId, index, lag],
    );
    return seeded;
  };

  it('stores exact ICL evidence, applies once concurrently and recovers the same calculation after provider revisions', async () => {
    const { leaseId } = await indexedLease('icl', null);
    const first = await addObservation('icl', '2088-01-01', '1.50');
    const last = await addObservation('icl', '2088-04-01', '2.47');
    const idempotencyKey = randomUUID(),
      body = { ...april, issue: true, idempotencyKey };
    const responses = await Promise.all([
      generate(leaseId, body),
      generate(leaseId, body),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    const invoice = responses[0].body;
    expect(Number(invoice.total)).toBe(1646.67);
    const calculation = invoice.rentCalculation;
    expect(calculation.finalRent).toBe('1646.67');
    expect(
      calculation.adjustments[0].observations.map((row: any) => row.id),
    ).toEqual([first, last]);
    expect(
      (
        await db.query(
          'SELECT next_adjustment_date::text,last_adjustment_date::text,adjustment_anchor_date::text FROM leases WHERE id=$1',
          [leaseId],
        )
      )[0],
    ).toEqual({
      next_adjustment_date: '2088-07-01',
      last_adjustment_date: '2088-04-01',
      adjustment_anchor_date: '2088-04-01',
    });
    await addObservation('icl', '2088-04-01', '3', 2);
    const recovered = await generate(leaseId, body).expect(201);
    expect(recovered.body.rentCalculation).toEqual(calculation);
    await request(app.getHttpServer())
      .get(`/invoices/${invoice.id}`)
      .auth(foreignToken, { type: 'bearer' })
      .expect(404);
    const read = await request(app.getHttpServer())
      .get(`/invoices/${invoice.id}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(read.body.rentCalculation).toEqual(calculation);
    await expect(
      db.query("UPDATE invoices SET rent_calculation='{}' WHERE id=$1", [
        invoice.id,
      ]),
    ).rejects.toThrow('immutable');
    await generate(leaseId, {
      periodStart: '2088-03-01',
      periodEnd: '2088-03-31',
      dueDate: '2088-04-10',
      applyAdjustment: false,
    }).expect(400);
  });

  it.each([
    ['ipc', '1210.00'],
    ['igp_m', '1197.90'],
  ])(
    'uses accumulated %s with an explicit lag and complete monthly evidence',
    async (index, expected) => {
      const { leaseId } = await indexedLease(index, 1);
      if (index === 'ipc') {
        await addObservation(index, '2087-12-01', '100');
        await addObservation(index, '2088-03-01', '121');
      } else {
        await addObservation(index, '2088-01-01', '10');
        await addObservation(index, '2088-02-01', '10');
        await addObservation(index, '2088-03-01', '-1');
      }
      const result = await generate(leaseId, { ...april, issue: true }).expect(
        201,
      );
      expect(result.body.rentCalculation.finalRent).toBe(expected);
      expect(result.body.rentCalculation.adjustments[0].lagMonths).toBe(1);
    },
  );

  it('rolls back a missing monthly observation without changing rent, calendar, invoice or generation key', async () => {
    const { leaseId } = await indexedLease('igp_m', 1);
    await addObservation('igp_m', '2088-01-01', '10');
    await addObservation('igp_m', '2088-03-01', '-1');
    const before = (
      await db.query(
        'SELECT monthly_rent,next_billing_date,last_adjustment_date,next_adjustment_date FROM leases WHERE id=$1',
        [leaseId],
      )
    )[0];
    const idempotencyKey = randomUUID();
    const failed = await generate(leaseId, {
      ...april,
      issue: true,
      idempotencyKey,
    }).expect(400);
    expect(failed.body.message).toContain('2088-02-01');
    expect(
      (
        await db.query(
          'SELECT monthly_rent,next_billing_date,last_adjustment_date,next_adjustment_date FROM leases WHERE id=$1',
          [leaseId],
        )
      )[0],
    ).toEqual(before);
    expect(
      await db.query('SELECT id FROM invoice_generations WHERE company_id=$1', [
        companyId,
      ]),
    ).toEqual([]);
    await addObservation('igp_m', '2088-02-01', '10');
    expect(
      (
        await generate(leaseId, {
          ...april,
          issue: true,
          idempotencyKey,
        }).expect(201)
      ).body.rentCalculation.finalRent,
    ).toBe('1197.90');
  });

  it('requires an explicit monthly lag without inventing one for existing contracts', async () => {
    const { leaseId } = await indexedLease('ipc', null);
    const failed = await generate(leaseId, april).expect(400);
    expect(failed.body.message).toContain('explicitly');
    expect(
      (
        await db.query(
          'SELECT monthly_rent,inflation_index_lag_months FROM leases WHERE id=$1',
          [leaseId],
        )
      )[0],
    ).toEqual({ monthly_rent: '1000.00', inflation_index_lag_months: null });
  });

  it('recovers an approved invoice after the domain committed but its approval result was lost', async () => {
    const { leaseId, accountId } = await seed();
    const [{ user_id: requester }] = await db.query(
      'SELECT user_id FROM tenants WHERE id=$1',
      [tenantId],
    );
    const payload = { leaseId, ...october, issue: true };
    const ordered = Object.fromEntries(
      Object.entries(payload).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    const [action] = await db.query(
      `INSERT INTO pending_actions(company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,expires_at)
      VALUES($1,$2,'post_invoices_generate_for_lease','create','invoice','Generate invoice',$3::jsonb,$4,now()+interval '15 minutes') RETURNING id,execution_key`,
      [
        companyId,
        requester,
        JSON.stringify(payload),
        createHash('sha256').update(JSON.stringify(ordered)).digest('hex'),
      ],
    );
    const reauth = (
      await request(app.getHttpServer())
        .post('/auth/reauthenticate')
        .auth(token, { type: 'bearer' })
        .send({ password })
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
        throw new Error('lost response after domain commit');
      });
    const approve = () =>
      request(app.getHttpServer())
        .post(`/pending-actions/${action.id}/approve`)
        .auth(token, { type: 'bearer' })
        .send({ reauthToken: reauth });
    try {
      expect((await approve().expect(201)).body.status).toBe('failed');
      lost.mockRestore();
      const [receipt] = await db.query(
        'SELECT invoice_id,result_snapshot FROM invoice_generations WHERE company_id=$1 AND idempotency_key=$2',
        [companyId, action.execution_key],
      );
      expect(receipt.result_snapshot.status).toBe('pending');
      expect(typeof receipt.result_snapshot.issuedAt).toBe('string');
      await app.get(InvoicesService).cancel(receipt.invoice_id, companyId);
      const recovered = (await approve().expect(201)).body;
      expect(recovered.status).toBe('executed');
      expect(recovered.result).toEqual(receipt.result_snapshot);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM tenant_account_movements WHERE tenant_account_id=$1 AND movement_type='charge'",
            [accountId],
          )
        )[0].count,
      ).toBe(1);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM invoice_generations WHERE company_id=$1',
            [companyId],
          )
        )[0].count,
      ).toBe(1);
      await expect(
        db.query(
          "UPDATE invoice_generations SET result_snapshot='{}' WHERE invoice_id=$1",
          [receipt.invoice_id],
        ),
      ).rejects.toThrow('immutable');
    } finally {
      lost.mockRestore();
      if (mode === undefined) delete process.env.AI_TOOLS_MODE;
      else process.env.AI_TOOLS_MODE = mode;
    }
  });

  it('recovers explicit conversation confirmations and prevents bypassing queued administrative approval', async () => {
    const { leaseId } = await seed(),
      conversationId = randomUUID();
    await db.query(
      'INSERT INTO ai_conversations(id,user_id,company_id) VALUES($1,$2,$3)',
      [conversationId, userId, companyId],
    );
    const executor = app.get(AiToolExecutorService),
      mode = process.env.AI_TOOLS_MODE;
    process.env.AI_TOOLS_MODE = 'FULL';
    const context = { userId, companyId, role: UserRole.ADMIN, conversationId };
    const payload = { leaseId, ...october, issue: true };
    try {
      const preview: any = await executor.execute(
        'post_invoices_generate_for_lease',
        payload,
        context,
      );
      const confirmed = {
        ...context,
        confirmMutation: true,
        confirmationId: preview.confirmationId,
      };
      const first: any = await executor.execute(
        'post_invoices_generate_for_lease',
        payload,
        confirmed,
      );
      const second: any = await executor.execute(
        'post_invoices_generate_for_lease',
        payload,
        confirmed,
      );
      expect(second).toEqual(JSON.parse(JSON.stringify(first)));
      expect(typeof second.issuedAt).toBe('string');
      const legacy: any = await executor.execute(
        'post_invoices_generate_for_lease',
        payload,
        context,
      );
      await db.query(
        "UPDATE ai_tool_mutation_confirmations SET status='confirmed',confirmed_at=now() WHERE id=$1",
        [legacy.confirmationId],
      );
      await expect(
        executor.execute('post_invoices_generate_for_lease', payload, {
          ...confirmed,
          confirmationId: legacy.confirmationId,
        }),
      ).rejects.toThrow('No matching');
      const queued: any = await executor.execute(
        'post_invoices_generate_for_lease',
        payload,
        { ...context, mutationApprovalMode: 'staff_queue' },
      );
      await expect(
        executor.execute('post_invoices_generate_for_lease', payload, {
          ...confirmed,
          confirmationId: queued.confirmationId,
        }),
      ).rejects.toThrow('No matching');
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM invoice_generations WHERE company_id=$1',
            [companyId],
          )
        )[0].count,
      ).toBe(1);
    } finally {
      if (mode === undefined) delete process.env.AI_TOOLS_MODE;
      else process.env.AI_TOOLS_MODE = mode;
    }
  });

  it('rolls back rent adjustment, calendar, invoice, account, commission and job together if auto-issuance fails', async () => {
    const { leaseId, accountId } = await seed();
    const idempotencyKey = randomUUID();
    await db.query(
      "UPDATE leases SET next_billing_date='2026-10-01',next_adjustment_date='2026-10-01',adjustment_type='percentage',adjustment_value=10 WHERE id=$1",
      [leaseId],
    );
    const before = (
      await db.query(
        'SELECT monthly_rent,next_billing_date,last_billing_date,next_adjustment_date,last_adjustment_date FROM leases WHERE id=$1',
        [leaseId],
      )
    )[0];
    const capture = jest
      .spyOn(app.get(InvoicePdfService), 'captureSnapshot')
      .mockRejectedValueOnce(new Error('snapshot failed'));
    await expect(
      app
        .get(InvoicesService)
        .generateForLease(leaseId, { issue: true, idempotencyKey }, companyId),
    ).rejects.toThrow('snapshot failed');
    capture.mockRestore();
    expect(
      (
        await db.query(
          'SELECT monthly_rent,next_billing_date,last_billing_date,next_adjustment_date,last_adjustment_date FROM leases WHERE id=$1',
          [leaseId],
        )
      )[0],
    ).toEqual(before);
    expect(
      (
        await db.query(
          'SELECT current_balance FROM tenant_accounts WHERE id=$1',
          [accountId],
        )
      )[0].current_balance,
    ).toBe('0.00');
    expect(await jobs()).toHaveLength(0);
    expect(
      await db.query('SELECT id FROM invoices WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM commission_invoices WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(0);
    expect(
      await db.query('SELECT id FROM invoice_generations WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(0);
    const retry = await generate(leaseId, {
      issue: true,
      idempotencyKey,
    }).expect(201);
    expect(
      (await generate(leaseId, { issue: true, idempotencyKey }).expect(201))
        .body.id,
    ).toBe(retry.body.id);
    expect(await jobs()).toHaveLength(1);
  });

  it('recovers concurrent automatic requests without advancing another period or repeating charges', async () => {
    const { leaseId, accountId } = await seed();
    const idempotencyKey = randomUUID();
    await db.query(
      "UPDATE leases SET next_billing_date='2026-10-01' WHERE id=$1",
      [leaseId],
    );
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        generate(leaseId, { issue: true, idempotencyKey }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    const id = results[0].body.id;
    expect(
      (
        await generate(leaseId, {
          issue: true,
          applyLateFee: false,
          applyAdjustment: true,
          idempotencyKey: idempotencyKey.toUpperCase(),
        }).expect(201)
      ).body.id,
    ).toBe(id);
    expect(await jobs()).toHaveLength(1);
    expect(
      (
        await db.query(
          'SELECT current_balance FROM tenant_accounts WHERE id=$1',
          [accountId],
        )
      )[0].current_balance,
    ).toBe('1000.00');
    expect(
      await db.query(
        'SELECT id FROM tenant_account_movements WHERE reference_id=$1',
        [id],
      ),
    ).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM commission_invoices WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          'SELECT next_billing_date::text FROM leases WHERE id=$1',
          [leaseId],
        )
      )[0].next_billing_date,
    ).toBe('2026-11-01');
    await generate(
      leaseId,
      { issue: true, idempotencyKey },
      foreignToken,
    ).expect(404);
    await generate(
      leaseId,
      { issue: true, idempotencyKey },
      tenantToken,
    ).expect(403);
    await expect(
      db.query(
        "UPDATE invoice_generations SET request='{}' WHERE invoice_id=$1",
        [id],
      ),
    ).rejects.toThrow('immutable');
  });

  it('rejects reusing a key with different options and preserves the original result', async () => {
    const { leaseId } = await seed();
    const idempotencyKey = randomUUID();
    const body = { ...october, idempotencyKey };
    const first = await generate(leaseId, body).expect(201);
    for (const change of [
      { issue: true },
      { applyLateFee: true },
      { applyAdjustment: false },
      { dueDate: '2026-11-11' },
    ])
      await generate(leaseId, { ...body, ...change }).expect(409);
    await generate(leaseId, { idempotencyKey }).expect(409);
    expect((await generate(leaseId, body).expect(201)).body.id).toBe(
      first.body.id,
    );
    expect(
      await db.query('SELECT id FROM invoice_generations WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(1);
    expect(await jobs()).toHaveLength(0);
  });

  it('rejects reusing a company key for another lease', async () => {
    const firstLease = await seed();
    const body = { ...october, idempotencyKey: randomUUID() };
    const first = await generate(firstLease.leaseId, body).expect(201);
    await db.query("UPDATE leases SET status='finalized' WHERE id=$1", [
      firstLease.leaseId,
    ]);
    const secondLease = await seed();
    await generate(secondLease.leaseId, body).expect(409);
    expect((await generate(firstLease.leaseId, body).expect(201)).body.id).toBe(
      first.body.id,
    );
    expect(
      await db.query('SELECT id FROM invoices WHERE lease_id=$1', [
        secondLease.leaseId,
      ]),
    ).toHaveLength(1);
  });

  it.each(['cancelled', 'refunded', 'deleted'])(
    'keeps the key consumed after the original is %s',
    async (state) => {
      const { leaseId } = await seed();
      const body = { ...october, idempotencyKey: randomUUID() };
      const first = await generate(leaseId, body).expect(201);
      if (state === 'deleted')
        await db.query('UPDATE invoices SET deleted_at=now() WHERE id=$1', [
          first.body.id,
        ]);
      else
        await db.query('UPDATE invoices SET status=$2 WHERE id=$1', [
          first.body.id,
          state,
        ]);
      await generate(leaseId, body).expect(409);
      expect(
        await db.query('SELECT id FROM invoices WHERE lease_id=$1', [leaseId]),
      ).toHaveLength(2);
      expect(
        await db.query(
          'SELECT id FROM invoice_generations WHERE company_id=$1',
          [companyId],
        ),
      ).toHaveLength(1);
    },
  );

  it('recovers the same result through the real AI tool and rejects string booleans', async () => {
    const { leaseId } = await seed();
    const args = {
      leaseId,
      ...october,
      issue: true,
      idempotencyKey: randomUUID(),
    };
    const tool = buildAiToolDefinitions({
      invoicesService: app.get(InvoicesService),
    } as any).find((t) => t.name === 'post_invoices_generate_for_lease')!;
    const context = { companyId, userId, role: UserRole.ADMIN } as any;
    const first = await tool.execute(args, context);
    const second = await tool.execute(args, context);
    expect((second as any).id).toBe((first as any).id);
    await expect(
      tool.execute({ ...args, issue: 'false' }, context),
    ).rejects.toThrow();
    await generate(leaseId, { ...october, issue: 'false' }).expect(400);
    await generate(leaseId, {
      ...october,
      idempotencyKey: 'not-a-uuid',
    }).expect(400);
    expect(await jobs()).toHaveLength(1);
  });

  const scheduled = (
    body: Record<string, unknown>,
    secret = 'billing-test-token',
  ) =>
    request(app.getHttpServer())
      .post('/invoices/internal/generate-due')
      .set('x-batch-billing-token', secret)
      .send(body);

  it('previews without writes, scopes candidates and generates scheduled invoices safely under concurrency', async () => {
    const { leaseId } = await seed();
    await db.query(
      "UPDATE leases SET next_billing_date='2026-10-01',billing_frequency='custom',billing_day=5 WHERE id=$1",
      [leaseId],
    );
    const body = { billingDate: '2026-10-10', companyId, leaseId };
    await scheduled(body, 'wrong').expect(401);
    await scheduled({ ...body, billingDate: '2026-02-30' }).expect(400);
    await scheduled({ ...body, dryRun: 'false' }).expect(400);
    expect(
      (await scheduled({ ...body, companyId: foreignId }).expect(201)).body
        .processedLeases,
    ).toBe(0);
    expect(
      (await scheduled({ ...body, dryRun: true }).expect(201)).body,
    ).toMatchObject({
      processedLeases: 1,
      invoicesSkipped: 1,
      invoicesProcessed: 0,
      totals: [],
    });
    expect(await jobs()).toHaveLength(0);
    expect(
      await db.query('SELECT id FROM invoice_generations WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(0);
    const results = await Promise.all([scheduled(body), scheduled(body)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results.every((r) => r.body.invoicesFailed === 0)).toBe(true);
    expect(await jobs()).toHaveLength(1);
    const [invoice] = await db.query(
      "SELECT total_amount::text,currency FROM invoices WHERE lease_id=$1 AND status='pending'",
      [leaseId],
    );
    expect(invoice).toEqual({ total_amount: '1000.00', currency: 'ARS' });
    expect((await scheduled(body).expect(201)).body.processedLeases).toBe(0);
    expect(
      await db.query('SELECT id FROM invoice_generations WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(1);
  });

  it('recovers the same scheduled day even when another overdue period remains eligible', async () => {
    const { leaseId, accountId } = await seed();
    await db.query(
      "UPDATE leases SET start_date='2026-08-01',next_billing_date='2026-08-01' WHERE id=$1",
      [leaseId],
    );
    const body = { billingDate: '2026-10-10', companyId, leaseId };
    expect((await scheduled(body).expect(201)).body.invoicesProcessed).toBe(1);
    expect((await scheduled(body).expect(201)).body).toMatchObject({
      invoicesProcessed: 1,
      invoicesFailed: 0,
    });
    expect(await jobs()).toHaveLength(1);
    expect(
      (
        await db.query(
          'SELECT next_billing_date::text FROM leases WHERE id=$1',
          [leaseId],
        )
      )[0].next_billing_date,
    ).toBe('2026-09-01');
    expect(
      (
        await db.query(
          'SELECT current_balance::text FROM tenant_accounts WHERE id=$1',
          [accountId],
        )
      )[0].current_balance,
    ).toBe('1000.00');
  });

  it.each([
    ['last_of_month', '2026-10-31'],
    ['contract_date', '2026-10-15'],
  ])('respects the %s scheduling policy', async (frequency, billingDate) => {
    const { leaseId } = await seed();
    await db.query(
      "UPDATE leases SET start_date='2026-09-15',next_billing_date='2026-10-01',billing_frequency=$2 WHERE id=$1",
      [leaseId, frequency],
    );
    expect(
      (
        await scheduled({
          billingDate: '2026-10-10',
          companyId,
          leaseId,
        }).expect(201)
      ).body.processedLeases,
    ).toBe(0);
    expect(
      (await scheduled({ billingDate, companyId, leaseId }).expect(201)).body
        .invoicesProcessed,
    ).toBe(1);
  });

  it('clamps due day 31 to February and preserves lease currency in the common ledger', async () => {
    const { leaseId, accountId } = await seed();
    await db.query(
      "UPDATE leases SET next_billing_date='2027-02-01',billing_frequency='custom',billing_day=31,payment_due_day=31,currency='USD' WHERE id=$1",
      [leaseId],
    );
    await db.query("UPDATE tenant_accounts SET currency='USD' WHERE id=$1", [
      accountId,
    ]);
    const body = { billingDate: '2027-02-28', companyId, leaseId };
    const result = (await scheduled(body).expect(201)).body;
    expect(result).toMatchObject({
      invoicesProcessed: 1,
      invoicesFailed: 0,
      totals: [{ currencyCode: 'USD', amount: '1000.00' }],
    });
    const [invoice] = await db.query(
      "SELECT currency,due_date::text,total_amount::text,withholding_iibb::text FROM invoices WHERE lease_id=$1 AND status='pending'",
      [leaseId],
    );
    expect(invoice).toEqual({
      currency: 'USD',
      due_date: '2027-02-28',
      total_amount: '1000.00',
      withholding_iibb: '0.00',
    });
    expect(
      (
        await db.query(
          'SELECT current_balance::text,currency FROM tenant_accounts WHERE id=$1',
          [accountId],
        )
      )[0],
    ).toEqual({ current_balance: '1000.00', currency: 'USD' });
  });

  it('reports currency mismatch and a stale scheduled source without advancing billing', async () => {
    const { leaseId, accountId } = await seed();
    await db.query(
      "UPDATE leases SET next_billing_date='2026-10-01',currency='USD' WHERE id=$1",
      [leaseId],
    );
    const body = { billingDate: '2026-10-10', companyId, leaseId };
    expect((await scheduled(body).expect(201)).body).toMatchObject({
      invoicesProcessed: 0,
      invoicesFailed: 1,
    });
    await db.query("UPDATE leases SET currency='ARS' WHERE id=$1", [leaseId]);
    await db.query('UPDATE tenant_accounts SET is_active=false WHERE id=$1', [
      accountId,
    ]);
    expect((await scheduled(body).expect(201)).body).toMatchObject({
      invoicesProcessed: 0,
      invoicesFailed: 1,
    });
    await db.query('UPDATE tenant_accounts SET is_active=true WHERE id=$1', [
      accountId,
    ]);
    const service = app.get(InvoicesService),
      original = service.generateForLease.bind(service);
    const spy = jest
      .spyOn(service, 'generateForLease')
      .mockImplementationOnce(async (...args) => {
        await db.query(
          "UPDATE leases SET next_billing_date='2026-11-01' WHERE id=$1",
          [leaseId],
        );
        return original(...args);
      });
    const result = await app.get(ScheduledBillingService).process(body);
    spy.mockRestore();
    expect(result).toMatchObject({ invoicesProcessed: 0, invoicesFailed: 1 });
    expect(await jobs()).toHaveLength(0);
    expect(
      await db.query('SELECT id FROM invoice_generations WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(0);
  });

  it('paginates candidates and isolates a generation failure so later pages remain processable', async () => {
    const { leaseId } = await seed();
    await db.query(
      "UPDATE leases SET next_billing_date='2026-10-01' WHERE id=$1",
      [leaseId],
    );
    const body = { billingDate: '2026-10-10', companyId, limit: 1 };
    const capture = jest
      .spyOn(app.get(InvoicePdfService), 'captureSnapshot')
      .mockRejectedValueOnce(new Error('forced failure'));
    const failed = (await scheduled(body).expect(201)).body;
    capture.mockRestore();
    expect(failed).toMatchObject({
      invoicesProcessed: 0,
      invoicesFailed: 1,
      nextCursor: leaseId,
    });
    expect(
      (await scheduled({ ...body, afterLeaseId: leaseId }).expect(201)).body
        .processedLeases,
    ).toBe(0);
    expect((await scheduled(body).expect(201)).body.invoicesProcessed).toBe(1);
    expect(await jobs()).toHaveLength(1);
  });

  it('commits the invoice document and consented delivery together and retries a delivery failure once', async () => {
    const { id } = await seed();
    await db.query('UPDATE tenants SET contact_consent=true WHERE id=$1', [
      tenantId,
    ]);
    await db.query(
      "UPDATE users SET whatsapp_enabled=true,phone='+5491100000000' WHERE id=(SELECT user_id FROM tenants WHERE id=$1)",
      [tenantId],
    );
    await issue(id).expect(200);
    const communications = app.get(CommunicationsService);
    const spy = jest
      .spyOn(communications, 'dispatchEvent')
      .mockRejectedValueOnce(new Error('delivery persistence failed'));
    await worker.processDue();
    expect((await status(id).expect(200)).body.status).toBe('queued');
    expect(
      await db.query(
        "SELECT id FROM documents WHERE company_id=$1 AND entity_type='invoice'",
        [companyId],
      ),
    ).toHaveLength(0);
    await due();
    await worker.processDue();
    spy.mockRestore();
    await worker.processDue();
    const deliveries = await db.query(
      "SELECT id,status,related_entity_id,metadata FROM communication_deliveries WHERE company_id=$1 AND event='invoice_issued'",
      [companyId],
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      status: 'queued',
      related_entity_id: id,
      metadata: { templateName: 'invoice_available' },
    });
    expect(deliveries[0].metadata.attachmentUrl).toMatch(/^db:\/\/document\//);
    const transport = jest
      .spyOn(app.get(WhatsappService), 'sendTemplateMessage')
      .mockResolvedValue({ messageId: 'invoice-test-message' } as any);
    await db.query('UPDATE tenants SET contact_consent=false WHERE id=$1', [
      tenantId,
    ]);
    expect(await communications.retryDue()).toMatchObject({
      processed: 1,
      sent: 0,
      failed: 1,
    });
    expect(transport).not.toHaveBeenCalled();
    await db.query('UPDATE tenants SET contact_consent=true WHERE id=$1', [
      tenantId,
    ]);
    await communications.retry(deliveries[0].id, companyId);
    expect(await communications.retryDue()).toMatchObject({
      processed: 1,
      sent: 1,
      failed: 0,
    });
    expect(await communications.retryDue()).toMatchObject({
      processed: 0,
      sent: 0,
      failed: 0,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockRestore();
  });

  it('does not enqueue an invoice notice when consent was revoked before rendering', async () => {
    const { id } = await seed();
    await db.query('UPDATE tenants SET contact_consent=true WHERE id=$1', [
      tenantId,
    ]);
    await issue(id).expect(200);
    await db.query('UPDATE tenants SET contact_consent=false WHERE id=$1', [
      tenantId,
    ]);
    await worker.processDue();
    expect((await status(id).expect(200)).body.status).toBe('completed');
    expect(
      await db.query(
        'SELECT id FROM communication_deliveries WHERE company_id=$1',
        [companyId],
      ),
    ).toHaveLength(0);
  });

  it('serializes repeated custom periods, applies rent adjustment once and advances the calendar atomically', async () => {
    const { leaseId } = await seed();
    await db.query(
      "UPDATE leases SET next_billing_date='2026-10-01',next_adjustment_date='2026-10-01',adjustment_type='percentage',adjustment_value=10 WHERE id=$1",
      [leaseId],
    );
    await generate(leaseId, { ...october, issue: true }, foreignToken).expect(
      404,
    );
    const responses = await Promise.all([
      generate(leaseId, { ...october, issue: true }),
      generate(leaseId, { ...october, issue: true }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const [row] = await db.query(
      'SELECT monthly_rent,next_billing_date::text,last_billing_date::text FROM leases WHERE id=$1',
      [leaseId],
    );
    expect(row).toEqual({
      monthly_rent: '1100.00',
      next_billing_date: '2026-11-01',
      last_billing_date: '2026-10-01',
    });
    expect(await jobs()).toHaveLength(1);
    expect((await jobs())[0].snapshot.invoice.total).toBe('1100.00');
    expect(
      await db.query('SELECT id FROM commission_invoices WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(1);
  });

  it('allocates company-wide invoice and commission numbers across different owners concurrently', async () => {
    const first = await seed();
    const secondUser = await createActiveTestUser(app.get(UsersService), {
      companyId,
      role: UserRole.ADMIN,
      email: `second-${randomUUID()}@billing.test`,
      password,
      firstName: 'Second',
      lastName: 'Owner',
    });
    const [owner] = await db.query(
      'INSERT INTO owners(company_id,user_id,commission_rate) VALUES($1,$2,10) RETURNING id',
      [companyId, secondUser.id],
    );
    const property = await db.getRepository(Property).save({
      companyId,
      ownerId: owner.id,
      name: 'Second billing property',
      propertyType: PropertyType.APARTMENT,
      addressStreet: 'Test 200',
      addressCity: 'Buenos Aires',
      addressState: 'Buenos Aires',
    });
    const second = await seed(property.id, owner.id);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request(app.getHttpServer())
          .post('/invoices')
          .auth(token, { type: 'bearer' })
          .send({
            ...october,
            leaseId: i % 2 ? first.leaseId : second.leaseId,
            subtotal: 100,
          })
          .expect(201),
      ),
    );
    const numbers = results.map((r) => r.body.invoiceNumber);
    expect(new Set(numbers).size).toBe(6);
    for (const number of numbers) expect(number).toMatch(/^INV-\d{6}-\d{4}$/);
    await Promise.all(results.map((r) => issue(r.body.id).expect(200)));
    const commissions = await db.query(
      'SELECT invoice_number FROM commission_invoices WHERE company_id=$1',
      [companyId],
    );
    expect(
      new Set(
        commissions.map((r: { invoice_number: string }) => r.invoice_number),
      ).size,
    ).toBe(6);
    expect(await jobs()).toHaveLength(6);
  });

  it('rejects partial and reversed custom dates before changing invoices or billing dates', async () => {
    const { leaseId } = await seed();
    await generate(leaseId, { periodStart: '2026-10-01' }).expect(400);
    await generate(leaseId, { ...october, periodEnd: '2026-09-01' }).expect(
      400,
    );
    expect(
      await db.query('SELECT id FROM invoices WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(1);
    expect(
      (
        await db.query('SELECT next_billing_date FROM leases WHERE id=$1', [
          leaseId,
        ])
      )[0].next_billing_date,
    ).toBeNull();
  });

  it('keeps historical numbers reserved after soft deletion and ignores manual number formats', async () => {
    const { id, leaseId } = await seed();
    await db.query(
      "UPDATE invoices SET invoice_number='INV-202001-0099',deleted_at=now() WHERE id=$1",
      [id],
    );
    const response = await request(app.getHttpServer())
      .post('/invoices')
      .auth(token, { type: 'bearer' })
      .send({ ...october, leaseId, subtotal: 100 })
      .expect(201);
    expect(response.body.invoiceNumber).toMatch(/^INV-\d{6}-0100$/);
  });

  it('does not rewind billing dates when an explicit older period is created', async () => {
    const { leaseId } = await seed();
    await db.query(
      "UPDATE leases SET last_billing_date='2026-09-01',next_billing_date='2026-10-01' WHERE id=$1",
      [leaseId],
    );
    await generate(leaseId, {
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      dueDate: '2026-08-10',
    }).expect(201);
    expect(
      (
        await db.query(
          'SELECT last_billing_date::text,next_billing_date::text FROM leases WHERE id=$1',
          [leaseId],
        )
      )[0],
    ).toEqual({
      last_billing_date: '2026-09-01',
      next_billing_date: '2026-10-01',
    });
  });
});
