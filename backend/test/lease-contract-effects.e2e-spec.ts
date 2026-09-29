import { LeasesService } from '../src/leases/leases.service';
import { AiToolExecutorService } from '../src/ai/ai-tool-executor.service';
import { ContractType } from '../src/leases/entities/lease.entity';
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
import { LeaseContractEffectsService } from '../src/leases/lease-contract-effects.service';
import { PdfService } from '../src/leases/pdf.service';
import { TenantAccountsService } from '../src/payments/tenant-accounts.service';
import { ProviderHttpService } from '../src/integrations/provider-http.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Durable confirmed contracts (e2e)', () => {
  let app: INestApplication,
    db: DataSource,
    worker: LeaseContractEffectsService;
  let companyId: string,
    foreignId: string,
    userId: string,
    requesterId: string,
    propertyId: string,
    ownerId: string,
    tenantId: string,
    buyerId: string;
  let token: string, foreignToken: string, tenantToken: string;
  let network: jest.SpyInstance;
  const suffix = randomUUID().slice(0, 12),
    password = 'ContractsTest123!';
  const oldBatchToken = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
  const oldToolsMode = process.env.AI_TOOLS_MODE;
  beforeAll(async () => {
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'contracts-test-token';
    process.env.AI_TOOLS_MODE = 'FULL';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    worker = app.get(LeaseContractEffectsService);
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
    requesterId = (
      await createActiveTestUser(app.get(UsersService), {
        companyId,
        role: UserRole.ADMIN,
        email: `requester-${suffix}@contracts.test`,
        password,
        firstName: 'Request',
        lastName: 'Fixture',
      })
    ).id;
    foreignToken = (await create(foreignId, UserRole.ADMIN)).token;
    const tenantUser = await create(companyId, UserRole.TENANT);
    tenantToken = tenantUser.token;
    ownerId = (
      await db.query(
        'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
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
    buyerId = (
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
    for (const table of [
      'pending_actions',
      'domain_operation_receipts',
      'lease_contract_effects_outbox',
      'documents',
      'tenant_accounts',
      'leases',
      'lease_contract_templates',
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
    if (oldToolsMode === undefined) delete process.env.AI_TOOLS_MODE;
    else process.env.AI_TOOLS_MODE = oldToolsMode;
    if (oldBatchToken === undefined)
      delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    else process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = oldBatchToken;
  });
  const seed = async (sale = false) =>
    (
      await db.query(
        `INSERT INTO leases(company_id,property_id,owner_id,tenant_id,buyer_id,contract_type,status,start_date,end_date,monthly_rent,fiscal_value,currency,draft_contract_text,draft_contract_format)
    VALUES($1,$2,$3,$4,$5,$6,'draft','2026-09-01','2027-09-01',1000,1000,'ARS','Contrato confirmado de prueba','plain_text') RETURNING id`,
        [
          companyId,
          propertyId,
          ownerId,
          sale ? null : tenantId,
          sale ? buyerId : null,
          sale ? 'sale' : 'rental',
        ],
      )
    )[0].id as string;
  const confirm = (id: string, auth = token) =>
    request(app.getHttpServer())
      .post(`/contracts/${id}/confirm`)
      .auth(auth, { type: 'bearer' })
      .send({});
  const row = async (id: string) =>
    (await db.query('SELECT * FROM leases WHERE id=$1', [id]))[0];
  const jobs = () =>
    db.query(
      'SELECT * FROM lease_contract_effects_outbox WHERE company_id=$1',
      [companyId],
    );
  const due = () =>
    db.query(
      'UPDATE lease_contract_effects_outbox SET next_attempt_at=now() WHERE company_id=$1',
      [companyId],
    );

  const importedBytes = Buffer.from(
    'Contrato vigente importado. Texto original.',
  );
  const importContract = (
    sale = false,
    auth = token,
    fields: Record<string, string> = {},
    bytes = importedBytes,
  ) => {
    const upload = request(app.getHttpServer())
      .post('/contracts/import-current')
      .auth(auth, { type: 'bearer' });
    for (const [key, value] of Object.entries({
      propertyId,
      contractType: sale ? 'sale' : 'rental',
      ...(sale
        ? { buyerId, fiscalValue: '1000' }
        : {
            tenantId,
            startDate: '2026-09-01',
            endDate: '2027-09-01',
            monthlyRent: '1000',
          }),
      ...fields,
    }))
      upload.field(key, value);
    return upload.attach('file', bytes, {
      filename: 'vigente.txt',
      contentType: 'text/plain',
    });
  };
  const assertEmptyImport = async () => {
    for (const table of [
      'leases',
      'documents',
      'tenant_accounts',
      'lease_contract_effects_outbox',
    ]) {
      expect(
        await db.query(`SELECT id FROM ${table} WHERE company_id=$1`, [
          companyId,
        ]),
      ).toHaveLength(0);
    }
    expect(
      (
        await db.query('SELECT operation_state FROM properties WHERE id=$1', [
          propertyId,
        ])
      )[0].operation_state,
    ).toBe('available');
  };

  it('imports original bytes, account and property atomically with hash and no signature or PDF job', async () => {
    const response = await importContract().expect(201);
    expect(response.body).toMatchObject({
      status: 'active',
      signatureStatus: 'not_started',
      ownerId,
    });
    const [document] = await db.query(
      'SELECT * FROM documents WHERE company_id=$1',
      [companyId],
    );
    expect(document.file_data.equals(importedBytes)).toBe(true);
    expect(document.metadata).toMatchObject({
      imported: true,
      importedBy: userId,
      source: 'lease_contract',
      version: 1,
      sha256: createHash('sha256').update(importedBytes).digest('hex'),
    });
    expect(response.body.contractPdfUrl).toBe(document.file_url);
    expect(await jobs()).toHaveLength(0);
    expect(
      await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [
        response.body.id,
      ]),
    ).toHaveLength(1);
    expect(
      (
        await db.query('SELECT operation_state FROM properties WHERE id=$1', [
          propertyId,
        ])
      )[0].operation_state,
    ).toBe('rented');
    const endpoint = `/contracts/${response.body.id}/contract`;
    const download = await request(app.getHttpServer())
      .get(endpoint)
      .auth(tenantToken, { type: 'bearer' })
      .expect(200);
    expect(download.text).toBe(importedBytes.toString());
    await request(app.getHttpServer())
      .get(endpoint)
      .auth(foreignToken, { type: 'bearer' })
      .expect(404);
    const link = await request(app.getHttpServer())
      .get(`/documents/${document.id}/download-url`)
      .auth(tenantToken, { type: 'bearer' })
      .expect(200);
    const signedUrl = new URL(link.body.downloadUrl);
    const signedPath = `/documents/${document.id}/content${signedUrl.search}`;
    const signedDownload = await request(app.getHttpServer())
      .get(signedPath)
      .expect(200);
    expect(signedDownload.text).toBe(importedBytes.toString());
    await db.query('UPDATE documents SET file_data=$1 WHERE id=$2', [
      Buffer.from('alterado'),
      document.id,
    ]);
    await request(app.getHttpServer())
      .get(endpoint)
      .auth(token, { type: 'bearer' })
      .expect(409);
    await request(app.getHttpServer()).get(signedPath).expect(409);
  });

  it.each([false, true])(
    'serializes concurrent imports without partial losers (sale=%s)',
    async (sale) => {
      const responses = await Promise.all([
        importContract(sale),
        importContract(sale),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      for (const table of ['leases', 'documents']) {
        expect(
          await db.query(`SELECT id FROM ${table} WHERE company_id=$1`, [
            companyId,
          ]),
        ).toHaveLength(1);
      }
      expect(
        await db.query('SELECT id FROM tenant_accounts WHERE company_id=$1', [
          companyId,
        ]),
      ).toHaveLength(sale ? 0 : 1);
      expect(
        (
          await db.query('SELECT operation_state FROM properties WHERE id=$1', [
            propertyId,
          ])
        )[0].operation_state,
      ).toBe(sale ? 'sold' : 'rented');
    },
  );

  it('rolls back imported bytes, lease, property and newly persisted account on failure', async () => {
    const accounts = app.get(TenantAccountsService);
    const original = accounts.createForLease.bind(accounts);
    const fail = jest
      .spyOn(accounts, 'createForLease')
      .mockImplementation(async (...args) => {
        await original(...args);
        throw new Error('Failure after account persistence');
      });
    try {
      await importContract().expect(500);
      await assertEmptyImport();
    } finally {
      fail.mockRestore();
    }
    await importContract().expect(201);
  });

  it('rolls back a lease when the original document cannot be persisted', async () => {
    await db.query(`CREATE OR REPLACE FUNCTION test_fail_import_document() RETURNS trigger AS $$
      BEGIN IF NEW.company_id = '${companyId}'::uuid THEN RAISE EXCEPTION 'Injected import document failure'; END IF; RETURN NEW; END;
      $$ LANGUAGE plpgsql`);
    await db.query(
      'CREATE TRIGGER test_fail_import_document BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION test_fail_import_document()',
    );
    try {
      await importContract(true).expect(500);
      await assertEmptyImport();
    } finally {
      await db.query(
        'DROP TRIGGER IF EXISTS test_fail_import_document ON documents',
      );
      await db.query('DROP FUNCTION IF EXISTS test_fail_import_document()');
    }
    await importContract(true).expect(201);
  });

  it('rejects foreign scope, tenant mutations, unknown parties and empty input without records', async () => {
    await importContract(false, foreignToken).expect(404);
    await importContract(false, tenantToken).expect(403);
    await importContract(false, token, { tenantId: randomUUID() }).expect(404);
    await importContract(true, token, { buyerId: randomUUID() }).expect(404);
    await importContract(false, token, {}, Buffer.from('   ')).expect(400);
    await assertEmptyImport();
  });

  it('rejects real tenant and buyer IDs belonging to another company', async () => {
    const foreignUser = await app.get(UsersService).create({
      companyId: foreignId,
      role: UserRole.TENANT,
      roles: [UserRole.TENANT, UserRole.BUYER],
      email: `foreign-party-${suffix}@contracts.test`,
      password,
      firstName: 'Foreign',
      lastName: 'Party',
      isActive: true,
    });
    try {
      for (const table of ['tenants', 'buyers']) {
        await db.query(
          `INSERT INTO ${table}(company_id,user_id) SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE user_id=$2)`,
          [foreignId, foreignUser.id],
        );
      }
      const [foreignTenant] = await db.query(
        'SELECT id FROM tenants WHERE user_id=$1',
        [foreignUser.id],
      );
      const [foreignBuyer] = await db.query(
        'SELECT id FROM buyers WHERE user_id=$1',
        [foreignUser.id],
      );
      await importContract(false, token, { tenantId: foreignTenant.id }).expect(
        404,
      );
      await importContract(true, token, { buyerId: foreignBuyer.id }).expect(
        404,
      );
      await assertEmptyImport();
    } finally {
      await db.query('DELETE FROM tenants WHERE user_id=$1', [foreignUser.id]);
      await db.query('DELETE FROM buyers WHERE user_id=$1', [foreignUser.id]);
      await db.query('DELETE FROM users WHERE id=$1', [foreignUser.id]);
    }
  });

  it('keeps an existing active contract and its document when a later import conflicts', async () => {
    const first = await importContract().expect(201);
    await importContract().expect(409);
    const leases = await db.query(
      'SELECT id, status FROM leases WHERE company_id=$1',
      [companyId],
    );
    expect(leases).toEqual([{ id: first.body.id, status: 'active' }]);
    expect(
      await db.query('SELECT id FROM documents WHERE company_id=$1', [
        companyId,
      ]),
    ).toHaveLength(1);
  });

  it('commits confirmation, account, property and immutable PDF job together without rendering', async () => {
    const id = await seed();
    const render = jest.spyOn(app.get(PdfService), 'generateContract');
    try {
      const response = await confirm(id).expect(201);
      expect(response.body).toMatchObject({
        status: 'active',
        contractPdfUrl: null,
        signatureStatus: 'not_started',
      });
      expect(render).not.toHaveBeenCalled();
      const status = await request(app.getHttpServer())
        .get(`/contracts/${id}/contract-status`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(status.body).toEqual({ status: 'queued', available: false });
      await request(app.getHttpServer())
        .get(`/contracts/${id}/contract-status`)
        .auth(foreignToken, { type: 'bearer' })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/contracts/${id}/contract-status`)
        .expect(401);

      expect(
        (
          await db.query('SELECT * FROM tenant_accounts WHERE lease_id=$1', [
            id,
          ])
        ).length,
      ).toBe(1);
      expect(
        (
          await db.query('SELECT operation_state FROM properties WHERE id=$1', [
            propertyId,
          ])
        )[0].operation_state,
      ).toBe('rented');
      const [job] = await jobs();
      expect(job).toMatchObject({
        lease_id: id,
        requested_by: userId,
        status: 'queued',
        snapshot: {
          text: 'Contrato confirmado de prueba',
          format: 'plain_text',
          version: 1,
        },
      });
      await expect(
        db.query(
          "UPDATE lease_contract_effects_outbox SET snapshot='{}' WHERE lease_id=$1",
          [id],
        ),
      ).rejects.toThrow('immutable');
      await expect(
        db.query("UPDATE leases SET status='draft' WHERE id=$1", [id]),
      ).rejects.toThrow('revision');
      await expect(
        db.query(
          "UPDATE leases SET confirmed_contract_text='changed' WHERE id=$1",
          [id],
        ),
      ).rejects.toThrow('revision');
    } finally {
      render.mockRestore();
    }
  });
  it('rejects foreign, unauthenticated and tenant confirmations without writing', async () => {
    const id = await seed();
    await confirm(id, foreignToken).expect(404);
    await confirm(id, tenantToken).expect(403);
    await request(app.getHttpServer())
      .post(`/contracts/${id}/confirm`)
      .send({})
      .expect(401);
    expect(await jobs()).toEqual([]);
    expect((await row(id)).status).toBe('draft');
  });
  it('serializes duplicate confirmations and property replacements', async () => {
    const id = await seed();
    const responses = await Promise.all([confirm(id), confirm(id)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await jobs()).toHaveLength(1);
    const next = await seed(),
      last = await seed();
    await Promise.all([confirm(next).expect(201), confirm(last).expect(201)]);
    const active = await db.query(
      "SELECT id FROM leases WHERE property_id=$1 AND status='active'",
      [propertyId],
    );
    expect(active).toHaveLength(1);
    expect((await row(id)).status).toBe('finalized');
    expect(await jobs()).toHaveLength(3);
  });
  it('prevents legacy writers from introducing a second active rental on the same property', async () => {
    const active = await seed();
    await confirm(active).expect(201);
    const other = await seed();
    await expect(
      db.query("UPDATE leases SET status='active' WHERE id=$1", [other]),
    ).rejects.toThrow('uq_active_rental_property');
    expect((await row(other)).status).toBe('draft');
    expect((await row(active)).status).toBe('active');
  });
  it('rolls back replacement, property and account when confirmation fails after lease persistence', async () => {
    const old = await seed();
    await confirm(old).expect(201);
    const id = await seed();
    const fail = jest
      .spyOn(app.get(TenantAccountsService), 'createForLease')
      .mockRejectedValueOnce(new Error('Injected account failure'));
    try {
      await confirm(id).expect(500);
    } finally {
      fail.mockRestore();
    }
    expect((await row(old)).status).toBe('active');
    expect((await row(id)).status).toBe('draft');
    expect(await jobs()).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [id]),
    ).toEqual([]);
  });
  it('creates one checksummed document after commit and scopes authenticated downloads', async () => {
    const id = await seed();
    await confirm(id).expect(201);
    const results = await Promise.all([
      worker.processDue(),
      worker.processDue(),
    ]);
    expect(results.reduce((sum, r) => sum + r.completed, 0)).toBe(1);
    const [job] = await jobs();
    expect(job.status).toBe('completed');
    const status = await request(app.getHttpServer())
      .get(`/contracts/${id}/contract-status`)
      .auth(tenantToken, { type: 'bearer' })
      .expect(200);
    expect(status.body).toEqual({ status: 'completed', available: true });

    const [doc] = await db.query('SELECT * FROM documents WHERE id=$1', [
      job.document_id,
    ]);
    expect(doc.file_data.subarray(0, 4).toString()).toBe('%PDF');
    expect(doc.metadata).toMatchObject({
      source: 'lease_contract',
      sha256: createHash('sha256').update(doc.file_data).digest('hex'),
      version: 1,
      confirmedAt: job.snapshot.confirmedAt,
    });
    await request(app.getHttpServer())
      .get(`/contracts/${id}/contract`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/contracts/${id}/contract`)
      .auth(foreignToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/contracts/${id}/contract`)
      .auth(tenantToken, { type: 'bearer' })
      .expect(200);
    await db.query('UPDATE documents SET file_data=$2 WHERE id=$1', [
      doc.id,
      Buffer.from('tampered'),
    ]);
    await request(app.getHttpServer())
      .get(`/contracts/${id}/contract`)
      .auth(token, { type: 'bearer' })
      .expect(409);
    expect(
      await db.query('SELECT id FROM documents WHERE entity_id=$1', [id]),
    ).toHaveLength(1);
  });
  it('rolls back a partially rendered document and retries without duplicate artifacts', async () => {
    const id = await seed();
    await confirm(id).expect(201);
    const pdf = app.get(PdfService),
      original = pdf.generateContract.bind(pdf);
    const fail = jest
      .spyOn(pdf, 'generateContract')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error('After document persistence');
      });
    try {
      expect(await worker.processDue()).toMatchObject({ failed: 1 });
    } finally {
      fail.mockRestore();
    }
    expect(
      await db.query('SELECT id FROM documents WHERE entity_id=$1', [id]),
    ).toEqual([]);
    expect((await row(id)).contract_pdf_url).toBeNull();
    expect((await jobs())[0]).toMatchObject({
      status: 'queued',
      attempts: 1,
      document_id: null,
    });
    await due();
    expect(await worker.processDue()).toMatchObject({ completed: 1 });
    expect((await jobs())[0]).toMatchObject({
      status: 'completed',
      attempts: 2,
    });
  });
  it('keeps a failed document recoverable as a dead letter without reverting the confirmed lease', async () => {
    const id = await seed(true);
    await confirm(id).expect(201);
    expect(
      await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [id]),
    ).toEqual([]);
    const fail = jest
      .spyOn(app.get(PdfService), 'generateContract')
      .mockRejectedValue(new Error('Renderer unavailable'));
    try {
      for (let i = 0; i < 5; i++) {
        await due();
        await worker.processDue();
      }
    } finally {
      fail.mockRestore();
    }
    expect((await jobs())[0]).toMatchObject({
      status: 'dead_letter',
      attempts: 5,
    });
    expect((await row(id)).status).toBe('active');
    expect(await worker.processDue()).toMatchObject({
      processed: 0,
      deadLetter: 1,
    });
  });
  it('rolls back the tenant account and property if the outbox insert fails', async () => {
    const id = await seed();
    await db.query(
      `CREATE OR REPLACE FUNCTION test_fail_contract_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected outbox failure'; END; $$`,
    );
    await db.query(
      'CREATE TRIGGER test_fail_contract_job BEFORE INSERT ON lease_contract_effects_outbox FOR EACH ROW EXECUTE FUNCTION test_fail_contract_job()',
    );
    try {
      await confirm(id).expect(500);
    } finally {
      await db.query(
        'DROP TRIGGER test_fail_contract_job ON lease_contract_effects_outbox',
      );
      await db.query('DROP FUNCTION test_fail_contract_job()');
    }
    expect((await row(id)).status).toBe('draft');
    expect(
      await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [id]),
    ).toEqual([]);
    expect(
      (
        await db.query('SELECT operation_state FROM properties WHERE id=$1', [
          propertyId,
        ])
      )[0].operation_state,
    ).toBe('available');
    expect(await jobs()).toEqual([]);
  });
  it('keeps historical approved documents readable without manufacturing a queue or accepting pending uploads', async () => {
    const id = await seed();
    const pdf = app.get(PdfService);
    expect(await pdf.getContractStatus(id, companyId)).toEqual({
      status: 'unavailable',
      available: false,
    });
    const legacy = await pdf.generateContract(
      { id, companyId } as any,
      userId,
      'Historical contract',
    );
    expect(await pdf.getContractStatus(id, companyId)).toEqual({
      status: 'completed',
      available: true,
    });
    await db.query("UPDATE documents SET status='pending' WHERE id=$1", [
      legacy.id,
    ]);
    expect(await pdf.getContractStatus(id, companyId)).toEqual({
      status: 'unavailable',
      available: false,
    });
    expect(await jobs()).toEqual([]);
  });
  it('requires the internal batch credential for processing', async () => {
    await request(app.getHttpServer())
      .post('/leases/internal/process-contracts')
      .expect(401);
    await request(app.getHttpServer())
      .post('/leases/internal/process-contracts')
      .set('x-batch-communications-token', 'contracts-test-token')
      .expect(201);
  });
  const recoveryTools = [
    'post_lease_draft_render',
    'patch_lease_draft_text',
    'post_lease_confirm',
    'patch_lease_activate',
    'patch_lease_terminate',
    'patch_lease_finalize',
  ];
  const actor = () => ({ id: userId, companyId, role: UserRole.ADMIN });
  async function recoveryInput(toolName: string) {
    const id = await seed();
    if (toolName === 'post_lease_draft_render') {
      const template = await app.get(LeasesService).createTemplate(
        {
          name: 'Recovery template',
          contractType: ContractType.RENTAL,
          templateBody: 'Texto de plantilla aprobado',
        },
        companyId,
      );
      return { id, templateId: template.id };
    }
    if (toolName === 'patch_lease_draft_text')
      return { id, draftText: 'Texto aprobado', draftFormat: 'plain_text' };
    if (toolName === 'post_lease_confirm')
      return {
        id,
        finalText: 'Texto final aprobado',
        finalFormat: 'plain_text',
      };
    if (
      toolName === 'patch_lease_terminate' ||
      toolName === 'patch_lease_finalize'
    ) {
      await app.get(LeasesService).confirmDraft(id, userId, actor());
      return { id, reason: 'Cierre aprobado' };
    }
    return { id };
  }
  const snapshot = async () => ({
    leases: await db.query(
      'SELECT * FROM leases WHERE company_id=$1 ORDER BY id',
      [companyId],
    ),
    accounts: await db.query(
      'SELECT * FROM tenant_accounts WHERE company_id=$1 ORDER BY id',
      [companyId],
    ),
    jobs: await jobs(),
    properties: await db.query(
      'SELECT * FROM properties WHERE company_id=$1 ORDER BY id',
      [companyId],
    ),
  });

  it.each(recoveryTools)(
    'recovers approved %s after its committed response is lost',
    async (toolName) => {
      const payload = await recoveryInput(toolName);
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
      const [action] = await db.query(
        `INSERT INTO pending_actions(company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,expires_at)
      VALUES($1,$2,$3,'update','lease','Lease recovery',$4::jsonb,$5,now()+interval '15 minutes') RETURNING id,execution_key`,
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
          .auth(token, { type: 'bearer' })
          .send({ password })
          .expect(200)
      ).body.reauthToken;
      const executor = app.get(AiToolExecutorService),
        original = executor.executeApproved.bind(executor);
      const lost = jest
        .spyOn(executor, 'executeApproved')
        .mockImplementationOnce(async (...args) => {
          await original(...args);
          throw new Error('committed lease response lost');
        });
      const approve = () =>
        request(app.getHttpServer())
          .post(`/pending-actions/${action.id}/approve`)
          .auth(token, { type: 'bearer' })
          .send({ reauthToken });
      try {
        expect((await approve().expect(201)).body.status).toBe('failed');
        lost.mockRestore();
        const [receipt] = await db.query(
          'SELECT result FROM domain_operation_receipts WHERE company_id=$1 AND execution_key=$2',
          [companyId, action.execution_key],
        );
        const expectedStatus = [
          'post_lease_draft_render',
          'patch_lease_draft_text',
        ].includes(toolName)
          ? 'draft'
          : ['patch_lease_terminate', 'patch_lease_finalize'].includes(toolName)
            ? 'finalized'
            : 'active';
        expect(receipt.result.status).toBe(expectedStatus);
        if (expectedStatus === 'draft')
          await app
            .get(LeasesService)
            .confirmDraft(payload.id, userId, actor());
        if ((await row(payload.id)).status === 'active')
          await app
            .get(LeasesService)
            .terminate(payload.id, actor(), 'Later closure');
        await db.query('UPDATE leases SET deleted_at=now() WHERE id=$1', [
          payload.id,
        ]);
        const before = await snapshot();
        const recovered = (await approve().expect(201)).body;
        expect(recovered.status).toBe('executed');
        expect(recovered.result).toMatchObject({
          id: payload.id,
          status: expectedStatus,
        });
        expect(JSON.stringify(recovered.result)).not.toMatch(
          /passwordHash|passwordResetToken/,
        );
        const context = {
          companyId,
          userId,
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
            companyId: foreignId,
          }),
        ).rejects.toThrow();
        await expect(
          executor.executeApproved(toolName, payload, {
            ...context,
            role: UserRole.TENANT,
          }),
        ).rejects.toThrow();
        expect(await snapshot()).toEqual(before);
        expect(await jobs()).toHaveLength(1);
        expect(
          await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [
            payload.id,
          ]),
        ).toHaveLength(1);
      } finally {
        lost.mockRestore();
      }
    },
  );

  it.each(recoveryTools)(
    'rolls back %s when its operation receipt cannot be persisted',
    async (toolName) => {
      const payload = await recoveryInput(toolName),
        before = await snapshot();
      await db.query(`CREATE OR REPLACE FUNCTION lease_recovery_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.company_id='${companyId}'::uuid THEN RAISE EXCEPTION 'lease receipt unavailable'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER lease_recovery_test_fail BEFORE INSERT ON domain_operation_receipts FOR EACH ROW EXECUTE FUNCTION lease_recovery_test_fail();`);
      try {
        await expect(
          app.get(AiToolExecutorService).executeApproved(toolName, payload, {
            companyId,
            userId,
            role: UserRole.ADMIN,
            idempotencyKey: randomUUID(),
          }),
        ).rejects.toThrow('lease receipt unavailable');
      } finally {
        await db.query(
          'DROP TRIGGER lease_recovery_test_fail ON domain_operation_receipts; DROP FUNCTION lease_recovery_test_fail()',
        );
      }
      expect(await snapshot()).toEqual(before);
      expect(
        await db.query(
          'SELECT execution_key FROM domain_operation_receipts WHERE company_id=$1',
          [companyId],
        ),
      ).toHaveLength(0);
    },
  );

  it.each(['edit', 'render'])(
    'serializes concurrent draft %s and confirmation without reopening the lease',
    async (action) => {
      const payload = await recoveryInput(
        action === 'edit'
          ? 'patch_lease_draft_text'
          : 'post_lease_draft_render',
      );
      const service = app.get(LeasesService);
      const [confirmed, edited] = await Promise.allSettled([
        service.confirmDraft(
          payload.id,
          userId,
          actor(),
          undefined,
          undefined,
          randomUUID(),
        ),
        action === 'edit'
          ? service.updateDraftText(
              payload.id,
              'Concurrent text',
              actor(),
              'plain_text',
              randomUUID(),
            )
          : service.renderDraft(
              payload.id,
              actor(),
              payload.templateId,
              randomUUID(),
            ),
      ]);
      expect(confirmed.status).toBe('fulfilled');
      if (edited.status === 'rejected')
        expect(edited.reason.message).toContain('Only draft');
      const lease = await row(payload.id);
      expect(lease.status).toBe('active');
      expect(lease.draft_contract_text).toBe(lease.confirmed_contract_text);
      expect(await jobs()).toHaveLength(1);
      expect((await jobs())[0].snapshot.text).toBe(
        lease.confirmed_contract_text,
      );
    },
  );

  it('rejects a changed confirmation request under the same execution key', async () => {
    const id = await seed(),
      key = randomUUID(),
      service = app.get(LeasesService);
    await service.confirmDraft(
      id,
      userId,
      actor(),
      'Original',
      'plain_text',
      key,
    );
    await expect(
      service.confirmDraft(id, userId, actor(), 'Alterado', 'plain_text', key),
    ).rejects.toThrow('different operation or request');
    expect((await row(id)).confirmed_contract_text).toBe('Original');
    expect(await jobs()).toHaveLength(1);
  });
});
