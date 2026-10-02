import { buildMutationReview } from '../src/common/helpers/mutation-review';
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
  let tenantUserId: string;
  let network: jest.SpyInstance;
  const suffix = randomUUID().slice(0, 12),
    password = 'ContractsTest123!';
  const oldBatchToken = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
  const oldToolsMode = process.env.AI_TOOLS_MODE;
  const reviewedContext = async (
    tool: string,
    payload: unknown,
    context: any,
  ) => ({
    ...context,
    mutationReview:
      context.mutationReview ??
      (await buildMutationReview(
        db,
        companyId,
        tool,
        payload as Record<string, unknown>,
        new Date(Date.now() + 900_000).toISOString(),
      )),
  });
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
    tenantUserId = tenantUser.user.id;
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

  it('creates a rental contract using the user identifier returned by the tenant list', async () => {
    const response = await request(app.getHttpServer())
      .post('/contracts')
      .auth(token, { type: 'bearer' })
      .send({
        companyId,
        propertyId,
        tenantId: tenantUserId,
        contractType: 'rental',
        startDate: '2026-09-01',
        endDate: '2027-09-01',
        monthlyRent: 1000,
      });
    expect(response.status).toBe(201);
    expect(response.body.tenantId).toBe(tenantId);
    expect((await row(response.body.id)).tenant_id).toBe(tenantId);
  });

  it('persists tenant profile fields without a password and scopes email updates to the actor company', async () => {
    const created = await request(app.getHttpServer())
      .post('/tenants')
      .auth(token, { type: 'bearer' })
      .send({
        companyId: foreignId,
        firstName: 'Ana',
        lastName: 'Perfil',
        dni: suffix,
        cuil: '20123456789',
        dateOfBirth: '1990-02-10',
        nationality: 'AR',
        occupation: 'Analista',
        employer: 'Empresa',
        monthlyIncome: 50000,
        employmentStatus: 'employed',
        emergencyContactName: 'Juan',
        emergencyContactPhone: '123',
        emergencyContactRelationship: 'Hermano',
        creditScore: 600,
        notes: 'Datos verificados',
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      companyId,
      isActive: false,
      accessRequested: false,
      cuil: '20123456789',
    });
    expect(created.body.passwordHash).toBeUndefined();
    expect(created.body.tenantEntityId).toEqual(expect.any(String));
    const updated = await request(app.getHttpServer())
      .patch(`/tenants/${created.body.id}`)
      .auth(token, { type: 'bearer' })
      .send({
        email: `tenant-profile-${suffix}@example.invalid`,
        monthlyIncome: 0,
        creditScore: 0,
        notes: '',
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      email: `tenant-profile-${suffix}@example.invalid`,
      isActive: false,
      accessRequested: false,
      monthlyIncome: '0.00',
      creditScore: 0,
      notes: '',
    });
    const persisted = (
      await db.query('SELECT * FROM tenants WHERE id=$1', [
        created.body.tenantEntityId,
      ])
    )[0];
    expect(persisted).toMatchObject({
      company_id: companyId,
      cuil: '20123456789',
      occupation: 'Analista',
      employment_status: 'employed',
      monthly_income: '0.00',
      emergency_contact_name: 'Juan',
      emergency_contact_relationship: 'Hermano',
      credit_score: 0,
      notes: '',
    });
    const denied = await request(app.getHttpServer())
      .patch(`/tenants/${created.body.id}`)
      .auth(foreignToken, { type: 'bearer' })
      .send({ firstName: 'Foreign' });
    expect(denied.status).toBe(404);
  });

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
        await db.query('SELECT * FROM tenant_accounts WHERE lease_id=$1', [id]),
      ).toHaveLength(1);
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
    'post_lease_templates',
    'patch_lease_template_by_id',
    'delete_lease_by_id',
    'post_leases',
    'patch_lease_by_id',
    'patch_lease_renew',
    'post_lease_draft_render',
    'patch_lease_draft_text',
    'post_lease_confirm',
    'patch_lease_activate',
    'patch_lease_terminate',
    'patch_lease_finalize',
  ];
  const actor = () => ({ id: userId, companyId, role: UserRole.ADMIN });
  async function recoveryInput(toolName: string): Promise<any> {
    const templatePayload = {
      name: 'Approved template',
      contractType: ContractType.RENTAL,
      templateFormat: 'html' as const,
      templateBody: '<p>Approved body</p>',
    };
    if (toolName === 'post_lease_templates') return templatePayload;
    if (toolName === 'patch_lease_template_by_id') {
      const template = await app
        .get(LeasesService)
        .createTemplate(templatePayload, companyId);
      return { templateId: template.id, name: 'Approved rename' };
    }
    if (toolName === 'post_leases') {
      const template = await app.get(LeasesService).createTemplate(
        {
          name: 'New contract template',
          contractType: ContractType.RENTAL,
          templateBody: 'Contrato nuevo aprobado',
        },
        companyId,
      );
      return {
        companyId,
        propertyId,
        tenantId,
        startDate: '2026-09-01',
        endDate: '2027-09-01',
        monthlyRent: 1000,
        templateId: template.id,
      };
    }
    const id = await seed();
    if (toolName === 'patch_lease_renew') {
      const service = app.get(LeasesService);
      const template = await service.createTemplate(
        {
          name: 'Recoverable renewal',
          contractType: ContractType.RENTAL,
          templateBody: 'Renewal contract text',
        },
        companyId,
      );
      await service.renderDraft(id, actor(), template.id);
      await service.confirmDraft(id, userId, actor());
      return { id, notes: 'Approved renewal' };
    }
    if (toolName === 'patch_lease_by_id')
      return { id, notes: 'Approved partial edit' };
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
    templates: await db.query(
      'SELECT * FROM lease_contract_templates WHERE company_id=$1 ORDER BY id',
      [companyId],
    ),
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
        `INSERT INTO pending_actions(company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,expires_at,review)
      VALUES($1,$2,$3,'update','lease','Lease recovery',$4::jsonb,$5,now()+interval '15 minutes',$6::jsonb) RETURNING id,execution_key`,
        [
          companyId,
          requesterId,
          toolName,
          JSON.stringify(payload),
          createHash('sha256')
            .update(JSON.stringify(sort(payload)))
            .digest('hex'),
          JSON.stringify(
            await buildMutationReview(
              db,
              companyId,
              toolName,
              payload,
              new Date(Date.now() + 900_000).toISOString(),
            ),
          ),
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
        const templateTool = [
          'post_lease_templates',
          'patch_lease_template_by_id',
        ].includes(toolName);
        const deleting = toolName === 'delete_lease_by_id';
        const leaseId = deleting ? payload.id : receipt.result.id;
        if (templateTool) {
          expect(receipt.result.templateFormat).toBe('html');
          await db.query(
            "UPDATE lease_contract_templates SET name='Later change',deleted_at=now() WHERE id=$1",
            [receipt.result.id],
          );
        } else if (deleting) {
          expect((await row(leaseId)).deleted_at).not.toBeNull();
          expect(receipt.result).toEqual({
            message: 'Lease deleted successfully',
          });
        } else {
          const expectedStatus = [
            'post_leases',
            'patch_lease_by_id',
            'patch_lease_renew',
            'post_lease_draft_render',
            'patch_lease_draft_text',
          ].includes(toolName)
            ? 'draft'
            : ['patch_lease_terminate', 'patch_lease_finalize'].includes(
                  toolName,
                )
              ? 'finalized'
              : 'active';
          expect(receipt.result.status).toBe(expectedStatus);
          if (expectedStatus === 'draft')
            await app.get(LeasesService).confirmDraft(leaseId, userId, actor());
          if ((await row(leaseId)).status === 'active')
            await app
              .get(LeasesService)
              .terminate(leaseId, actor(), 'Later closure');
          await db.query('UPDATE leases SET deleted_at=now() WHERE id=$1', [
            leaseId,
          ]);
        }
        const before = await snapshot();
        const recovered = (await approve().expect(201)).body;
        expect(recovered.status).toBe('executed');
        expect(recovered.result).toEqual(receipt.result);
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
            Array.from({ length: 3 }, async () =>
              executor.executeApproved(
                toolName,
                payload,
                await reviewedContext(toolName, payload, context),
              ),
            ),
          ),
        ).toEqual([recovered.result, recovered.result, recovered.result]);
        if (toolName === 'post_lease_templates') {
          // Creating in another authenticated company is valid, but must not recover this company's receipt.
          const foreign = (await executor.executeApproved(
            toolName,
            payload,
            await reviewedContext(toolName, payload, {
              ...context,
              companyId: foreignId,
            }),
          )) as any;
          expect(foreign.companyId).toBe(foreignId);
          expect(foreign.id).not.toBe(receipt.result.id);
          await db.query(
            'DELETE FROM domain_operation_receipts WHERE company_id=$1',
            [foreignId],
          );
          await db.query(
            'DELETE FROM lease_contract_templates WHERE company_id=$1',
            [foreignId],
          );
        } else {
          await expect(
            executor.executeApproved(
              toolName,
              payload,
              await reviewedContext(toolName, payload, {
                ...context,
                companyId: foreignId,
              }),
            ),
          ).rejects.toThrow();
        }
        await expect(
          executor.executeApproved(
            toolName,
            payload,
            await reviewedContext(toolName, payload, {
              ...context,
              role: UserRole.TENANT,
            }),
          ),
        ).rejects.toThrow();
        expect(await snapshot()).toEqual(before);
        expect(await jobs()).toHaveLength(
          templateTool || deleting
            ? 0
            : toolName === 'patch_lease_renew'
              ? 2
              : 1,
        );
        expect(
          await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [
            leaseId,
          ]),
        ).toHaveLength(templateTool || deleting ? 0 : 1);
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
          app.get(AiToolExecutorService).executeApproved(
            toolName,
            payload,
            await reviewedContext(toolName, payload, {
              companyId,
              userId,
              role: UserRole.ADMIN,
              idempotencyKey: randomUUID(),
            }),
          ),
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
  it('persists the selected template when replacing a loaded template relation', async () => {
    const service = app.get(LeasesService);
    const templates = [];
    for (const name of ['Original', 'Replacement']) {
      templates.push(
        await service.createTemplate(
          {
            name,
            contractType: ContractType.RENTAL,
            templateBody: name,
          },
          companyId,
        ),
      );
    }
    const id = await seed();
    await service.renderDraft(id, actor(), templates[0].id);
    await service.renderDraft(id, actor(), templates[1].id);
    expect(await row(id)).toMatchObject({
      template_id: templates[1].id,
      template_name: 'Replacement',
      draft_contract_text: 'Replacement',
    });
    await service.update(id, { templateId: templates[0].id }, actor());
    expect(await row(id)).toMatchObject({
      template_id: templates[0].id,
      template_name: 'Original',
      draft_contract_text: 'Original',
    });
  });

  it('preserves omitted HTTP and AI fields when editing a rental contract', async () => {
    const id = await seed();
    await db.query(
      "UPDATE leases SET currency='USD',payment_frequency='annual',payment_due_day=25,renewal_alert_enabled=false,renewal_alert_periodicity='four_months' WHERE id=$1",
      [id],
    );
    await request(app.getHttpServer())
      .patch(`/contracts/${id}`)
      .auth(token, { type: 'bearer' })
      .send({ notes: 'HTTP note' })
      .expect(200);
    await app.get(AiToolExecutorService).executeApproved(
      'patch_lease_by_id',
      { id, notes: 'AI note' },
      await reviewedContext(
        'patch_lease_by_id',
        { id, notes: 'AI note' },
        {
          companyId,
          userId,
          role: UserRole.ADMIN,
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(await row(id)).toMatchObject({
      notes: 'AI note',
      currency: 'USD',
      payment_frequency: 'annual',
      payment_due_day: 25,
      renewal_alert_enabled: false,
      renewal_alert_periodicity: 'four_months',
      contract_type: 'rental',
    });
  });

  it('preserves a sale contract type when only its notes are patched', async () => {
    const id = await seed(true);
    await request(app.getHttpServer())
      .patch(`/contracts/${id}`)
      .auth(token, { type: 'bearer' })
      .send({ notes: 'Sale HTTP note' })
      .expect(200);
    await app.get(AiToolExecutorService).executeApproved(
      'patch_lease_by_id',
      { id, notes: 'Sale AI note' },
      await reviewedContext(
        'patch_lease_by_id',
        { id, notes: 'Sale AI note' },
        {
          companyId,
          userId,
          role: UserRole.ADMIN,
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(await row(id)).toMatchObject({
      contract_type: 'sale',
      buyer_id: buyerId,
      tenant_id: null,
      notes: 'Sale AI note',
    });
  });

  it('serializes concurrent draft creation for the same property and party', async () => {
    const payload = await recoveryInput('post_leases'),
      service = app.get(LeasesService);
    const results = await Promise.allSettled([
      service.create(payload, actor(), randomUUID()),
      service.create(payload, actor(), randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failed.reason.message).toContain('open contract');
    expect(
      await db.query('SELECT id FROM leases WHERE company_id=$1', [companyId]),
    ).toHaveLength(1);
  });

  it('recovers one revision of an active contract and rejects another open revision', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    const key = randomUUID(),
      input = { notes: 'Revision approved' };
    const revision = await service.update(id, input, actor(), key);
    expect(revision.id).not.toBe(id);
    expect(revision).toMatchObject({
      previousLeaseId: id,
      versionNumber: 2,
      status: 'draft',
      notes: 'Revision approved',
    });
    const before = await snapshot();
    expect(await service.update(id, input, actor(), key)).toEqual(
      JSON.parse(JSON.stringify(revision)),
    );
    await expect(
      service.update(id, { notes: 'Another revision' }, actor(), randomUUID()),
    ).rejects.toThrow('draft revision already exists');
    expect(await snapshot()).toEqual(before);
    expect((await row(id)).status).toBe('active');
  });

  it('does not leave a draft or partial edit when template rendering fails', async () => {
    const service = app.get(LeasesService),
      payload = await recoveryInput('post_leases');
    const render = jest
      .spyOn(service as any, 'renderDraftWithManager')
      .mockRejectedValue(new Error('render failed'));
    try {
      await expect(
        service.create(payload, actor(), randomUUID()),
      ).rejects.toThrow('render failed');
      expect(
        await db.query('SELECT id FROM leases WHERE company_id=$1', [
          companyId,
        ]),
      ).toHaveLength(0);
      const id = await seed();
      await db.query('UPDATE leases SET template_id=$2 WHERE id=$1', [
        id,
        payload.templateId,
      ]);
      const before = await snapshot();
      await expect(
        service.update(id, { notes: 'Must roll back' }, actor(), randomUUID()),
      ).rejects.toThrow('render failed');
      expect(await snapshot()).toEqual(before);
      await service.confirmDraft(id, userId, actor());
      const active = await snapshot();
      await expect(
        service.update(
          id,
          { notes: 'Revision must roll back' },
          actor(),
          randomUUID(),
        ),
      ).rejects.toThrow('render failed');
      expect(await snapshot()).toEqual(active);
    } finally {
      render.mockRestore();
    }
  });

  it('serializes a general draft edit with confirmation without overwriting the active original', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await Promise.all([
      service.confirmDraft(id, userId, actor()),
      service.update(id, { monthlyRent: 1200 }, actor(), randomUUID()),
    ]);
    expect((await row(id)).status).toBe('active');
    expect(await jobs()).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [id]),
    ).toHaveLength(1);
  });
  it('locks both properties in stable order for opposing draft moves with uppercase UUID input', async () => {
    const secondProperty = await db.getRepository(Property).save({
      companyId,
      ownerId,
      name: 'Swap property',
      propertyType: PropertyType.APARTMENT,
      addressStreet: 'Swap 100',
      addressCity: 'Buenos Aires',
      addressState: 'Buenos Aires',
    });
    const rental = await seed(),
      sale = await seed(true);
    await db.query('UPDATE leases SET property_id=$2 WHERE id=$1', [
      sale,
      secondProperty.id,
    ]);
    const service = app.get(LeasesService);
    await Promise.all([
      service.update(
        rental,
        { propertyId: secondProperty.id.toUpperCase() },
        actor(),
        randomUUID(),
      ),
      service.update(
        sale,
        { propertyId: propertyId.toUpperCase() },
        actor(),
        randomUUID(),
      ),
    ]);
    expect((await row(rental)).property_id).toBe(secondProperty.id);
    expect((await row(sale)).property_id).toBe(propertyId);
  });
  it('renews over HTTP with inherited terms, civil dates, lineage and a fresh draft', async () => {
    const id = await seed();
    const service = app.get(LeasesService);
    const template = await service.createTemplate(
      {
        name: 'Inherited renewal template',
        contractType: ContractType.RENTAL,
        templateBody: 'Renewed contract',
      },
      companyId,
    );
    await db.query(
      `UPDATE leases SET currency='USD',payment_frequency='annual',payment_due_day=25,
      renewal_alert_enabled=false,renewal_alert_periodicity='four_months',security_deposit=750,
      adjustment_frequency_months=6,next_adjustment_date='2027-03-01',template_id=$2 WHERE id=$1`,
      [id, template.id],
    );
    await service.confirmDraft(id, userId, actor());
    const accounts = await db.query(
      'SELECT * FROM tenant_accounts WHERE lease_id=$1',
      [id],
    );
    const response = await request(app.getHttpServer())
      .patch(`/contracts/${id}/renew`)
      .auth(token, { type: 'bearer' })
      .send({ notes: 'Renewal only' })
      .expect(200);
    const renewed = await row(response.body.id);
    expect(renewed).toMatchObject({
      status: 'draft',
      contract_type: 'rental',
      currency: 'USD',
      payment_frequency: 'annual',
      payment_due_day: 25,
      renewal_alert_enabled: false,
      renewal_alert_periodicity: 'four_months',
      previous_lease_id: id,
      version_number: 2,
      notes: 'Renewal only',
      template_id: template.id,
      draft_contract_text: 'Renewed contract',
      confirmed_contract_text: null,
      confirmed_at: null,
      contract_pdf_url: null,
      next_adjustment_date: null,
    });
    expect(Number(renewed.security_deposit)).toBe(750);
    expect(Number(renewed.adjustment_frequency_months)).toBe(6);
    const [dates] = await db.query(
      'SELECT start_date::text, end_date::text FROM leases WHERE id=$1',
      [renewed.id],
    );
    expect(dates).toEqual({ start_date: '2027-09-01', end_date: '2028-08-31' });
    expect((await row(id)).status).toBe('finalized');
    expect(
      (
        await db.query('SELECT operation_state FROM properties WHERE id=$1', [
          propertyId,
        ])
      )[0].operation_state,
    ).toBe('available');
    expect(
      await db.query('SELECT * FROM tenant_accounts WHERE lease_id=$1', [id]),
    ).toEqual(accounts);
    expect(await jobs()).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [
        renewed.id,
      ]),
    ).toHaveLength(0);
  });

  it('inherits sale type, buyer and currency through an approved renewal', async () => {
    const id = await seed(true),
      service = app.get(LeasesService);
    await db.query("UPDATE leases SET currency='USD' WHERE id=$1", [id]);
    await service.confirmDraft(id, userId, actor());
    const renewed = (await app.get(AiToolExecutorService).executeApproved(
      'patch_lease_renew',
      { id, notes: 'Sale renewal' },
      await reviewedContext(
        'patch_lease_renew',
        { id, notes: 'Sale renewal' },
        {
          companyId,
          userId,
          role: UserRole.ADMIN,
          idempotencyKey: randomUUID(),
        },
      ),
    )) as any;
    expect(await row(renewed.id)).toMatchObject({
      contract_type: 'sale',
      buyer_id: buyerId,
      tenant_id: null,
      currency: 'USD',
      previous_lease_id: id,
      version_number: 2,
      status: 'draft',
    });
    expect((await row(id)).status).toBe('finalized');
    expect(
      (
        await db.query('SELECT operation_state FROM properties WHERE id=$1', [
          propertyId,
        ])
      )[0].operation_state,
    ).toBe('sold');
  });

  it('rolls back the old contract and property when renewal dates are invalid', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    const before = await snapshot();
    await request(app.getHttpServer())
      .patch(`/contracts/${id}/renew`)
      .auth(token, { type: 'bearer' })
      .send({ startDate: '2028-09-01', endDate: '2028-08-01' })
      .expect(400);
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back a renewal when inherited template rendering fails', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    const template = await service.createTemplate(
      {
        name: 'Renewal rollback',
        contractType: ContractType.RENTAL,
        templateBody: 'Renewal text',
      },
      companyId,
    );
    await db.query('UPDATE leases SET template_id=$2 WHERE id=$1', [
      id,
      template.id,
    ]);
    await service.confirmDraft(id, userId, actor());
    const before = await snapshot();
    const render = jest
      .spyOn(service as any, 'renderDraftWithManager')
      .mockRejectedValue(new Error('renewal render failed'));
    try {
      await expect(
        service.renew(id, {}, actor(), randomUUID()),
      ).rejects.toThrow('renewal render failed');
    } finally {
      render.mockRestore();
    }
    expect(await snapshot()).toEqual(before);
  });

  it('serializes different approved renewals and rejects changed terms under the original key', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    const attempts = [
      { key: randomUUID(), notes: 'First renewal' },
      { key: randomUUID(), notes: 'Second renewal' },
    ];
    const results = await Promise.allSettled(
      attempts.map((a) =>
        service.renew(id, { notes: a.notes }, actor(), a.key),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const winner = results.findIndex((r) => r.status === 'fulfilled');
    const before = await snapshot();
    await expect(
      service.renew(
        id,
        { notes: 'Different terms' },
        actor(),
        attempts[winner].key,
      ),
    ).rejects.toThrow('different operation or request');
    expect(await snapshot()).toEqual(before);
    expect(
      await db.query('SELECT id FROM leases WHERE previous_lease_id=$1', [id]),
    ).toHaveLength(1);
  });

  it('rejects renewal of an old finalized contract when its property has another active rental', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    await service.terminate(id, actor());
    const other = await seed();
    await service.confirmDraft(other, userId, actor());
    const before = await snapshot();
    await expect(
      service.renew(id, {}, actor(), randomUUID()),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it('serializes a renewal against creation of a revision of the same contract', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    const results = await Promise.allSettled([
      service.renew(id, { notes: 'Renewal' }, actor(), randomUUID()),
      service.update(id, { notes: 'Revision' }, actor(), randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      await db.query('SELECT id FROM leases WHERE previous_lease_id=$1', [id]),
    ).toHaveLength(1);
  });

  it('rejects foreign-company and tenant HTTP renewals and changes of contract identity', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    const before = await snapshot();
    await request(app.getHttpServer())
      .patch(`/contracts/${id}/renew`)
      .auth(foreignToken, { type: 'bearer' })
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/contracts/${id}/renew`)
      .auth(tenantToken, { type: 'bearer' })
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/contracts/${id}/renew`)
      .auth(token, { type: 'bearer' })
      .send({ propertyId })
      .expect(400);
    await expect(
      app.get(AiToolExecutorService).executeApproved(
        'patch_lease_renew',
        { id, tenantId },
        await reviewedContext(
          'patch_lease_renew',
          { id, tenantId },
          {
            companyId,
            userId,
            role: UserRole.ADMIN,
            idempotencyKey: randomUUID(),
          },
        ),
      ),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
  it('keeps HTTP template format and activation unchanged for a name-only edit', async () => {
    const template = await app.get(LeasesService).createTemplate(
      {
        name: 'HTML',
        contractType: ContractType.RENTAL,
        templateFormat: 'html',
        templateBody: '<p>Original</p>',
        isActive: false,
      },
      companyId,
    );
    const response = await request(app.getHttpServer())
      .patch(`/contracts/templates/${template.id}`)
      .auth(token, { type: 'bearer' })
      .send({ name: 'Renamed HTML' })
      .expect(200);
    expect(response.body).toMatchObject({
      name: 'Renamed HTML',
      templateFormat: 'html',
      templateBody: '<p>Original</p>',
      isActive: false,
    });
    await request(app.getHttpServer())
      .patch(`/contracts/templates/${template.id}`)
      .auth(foreignToken, { type: 'bearer' })
      .send({ name: 'Foreign' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/contracts/templates/${template.id}`)
      .auth(tenantToken, { type: 'bearer' })
      .send({ name: 'Tenant' })
      .expect(403);
  });

  it('serializes independent template edits without overwriting the other field', async () => {
    const service = app.get(LeasesService);
    const template = await service.createTemplate(
      {
        name: 'Initial',
        contractType: ContractType.RENTAL,
        templateFormat: 'html',
        templateBody: '<p>Initial</p>',
      },
      companyId,
    );
    await Promise.all([
      service.updateTemplate(
        template.id,
        { name: 'Concurrent rename' },
        companyId,
        randomUUID(),
      ),
      service.updateTemplate(
        template.id,
        { templateBody: '<p>Concurrent body</p>' },
        companyId,
        randomUUID(),
      ),
    ]);
    const [persisted] = await db.query(
      'SELECT * FROM lease_contract_templates WHERE id=$1',
      [template.id],
    );
    expect(persisted).toMatchObject({
      name: 'Concurrent rename',
      template_body: '<p>Concurrent body</p>',
      template_format: 'html',
    });
  });

  it.each(['post_lease_templates', 'patch_lease_template_by_id'])(
    'rejects changed parameters under the same approved key for %s',
    async (toolName) => {
      const payload = await recoveryInput(toolName);
      const context = {
        companyId,
        userId,
        role: UserRole.ADMIN,
        idempotencyKey: randomUUID(),
      };
      const executor = app.get(AiToolExecutorService);
      await executor.executeApproved(
        toolName,
        payload,
        await reviewedContext(toolName, payload, context),
      );
      const before = await snapshot();
      await expect(
        executor.executeApproved(
          toolName,
          { ...payload, name: 'Other name' },
          await reviewedContext(
            toolName,
            { ...payload, name: 'Other name' },
            context,
          ),
        ),
      ).rejects.toThrow('different operation or request');
      expect(await snapshot()).toEqual(before);
    },
  );

  it('does not soft-delete an active contract or allow another company or tenant to delete it', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    const before = await snapshot();
    await request(app.getHttpServer())
      .delete(`/contracts/${id}`)
      .auth(token, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/contracts/${id}`)
      .auth(foreignToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/contracts/${id}`)
      .auth(tenantToken, { type: 'bearer' })
      .expect(403);
    expect(await snapshot()).toEqual(before);
  });

  it('serializes draft deletion with confirmation and never leaves a deleted active contract', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    const outcomes = await Promise.allSettled([
      service.remove(id, actor(), randomUUID()),
      service.confirmDraft(id, userId, actor()),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
    const saved = await row(id);
    if (saved.deleted_at) {
      expect(saved.status).toBe('draft');
      expect(await jobs()).toHaveLength(0);
      expect(
        await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [
          id,
        ]),
      ).toHaveLength(0);
    } else {
      expect(saved.status).toBe('active');
      expect(await jobs()).toHaveLength(1);
      expect(
        await db.query('SELECT id FROM tenant_accounts WHERE lease_id=$1', [
          id,
        ]),
      ).toHaveLength(1);
    }
  });

  it('prevents deleting an original with a live successor and serializes deletion with renewal', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    await service.terminate(id, actor());
    const outcomes = await Promise.allSettled([
      service.renew(id, {}, actor(), randomUUID()),
      service.remove(id, actor(), randomUUID()),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
    const children = await db.query(
      'SELECT id FROM leases WHERE previous_lease_id=$1',
      [id],
    );
    const saved = await row(id);
    if (children.length) {
      expect(saved.deleted_at).toBeNull();
      await expect(service.remove(id, actor(), randomUUID())).rejects.toThrow(
        'live successor',
      );
    } else expect(saved.deleted_at).not.toBeNull();
  });

  it('retains finalized accounting and the immutable PDF job while recovering duplicate deletion', async () => {
    const id = await seed(),
      service = app.get(LeasesService);
    await service.confirmDraft(id, userId, actor());
    await service.terminate(id, actor());
    const accounts = await db.query(
      'SELECT * FROM tenant_accounts WHERE lease_id=$1',
      [id],
    );
    const beforeJobs = await jobs(),
      key = randomUUID();
    const results = await Promise.all([
      service.remove(id, actor(), key),
      service.remove(id, actor(), key),
    ]);
    expect(results).toEqual([
      { message: 'Lease deleted successfully' },
      { message: 'Lease deleted successfully' },
    ]);
    expect((await row(id)).deleted_at).not.toBeNull();
    expect(await jobs()).toEqual(beforeJobs);
    expect(
      await db.query('SELECT * FROM tenant_accounts WHERE lease_id=$1', [id]),
    ).toEqual(accounts);
    const other = await seed();
    await expect(service.remove(other, actor(), key)).rejects.toThrow(
      'different operation or request',
    );
    expect((await row(other)).deleted_at).toBeNull();
    await expect(service.remove(id, actor(), randomUUID())).rejects.toThrow(
      'Lease not found',
    );
    await worker.processDue();
    expect((await jobs())[0].document_id).not.toBeNull();
  });
  it.each([false, true])(
    'recovers an import after its response is lost and the contract is deleted (sale=%s)',
    async (sale) => {
      const key = randomUUID(),
        service = app.get(LeasesService);
      const original = service.importCurrentContract.bind(service);
      const lost = jest
        .spyOn(service, 'importCurrentContract')
        .mockImplementationOnce(async (...args) => {
          await original(...args);
          throw new Error('import response lost after commit');
        });
      await importContract(sale, token, { idempotencyKey: key }).expect(500);
      lost.mockRestore();
      const [receipt] = await db.query(
        'SELECT result FROM domain_operation_receipts WHERE company_id=$1 AND execution_key=$2',
        [companyId, key],
      );
      await service.terminate(receipt.result.id, actor());
      await service.remove(receipt.result.id, actor());
      const before = await snapshot();
      const parse = jest
        .spyOn(service as any, 'extractTextFromUploadedContract')
        .mockRejectedValue(new Error('must not reconvert'));
      try {
        const response = await importContract(sale, token, {
          idempotencyKey: key,
        }).expect(201);
        expect(response.body).toEqual(receipt.result);
      } finally {
        parse.mockRestore();
      }
      expect(await snapshot()).toEqual(before);
      const documents = await db.query(
        'SELECT file_data,metadata FROM documents WHERE company_id=$1',
        [companyId],
      );
      expect(documents).toHaveLength(1);
      expect(documents[0].file_data).toEqual(importedBytes);
      expect(documents[0].metadata.importedBy).toBe(userId);
    },
  );

  it.each([false, true])(
    'recovers simultaneous identical HTTP imports without duplicate artifacts (sale=%s)',
    async (sale) => {
      const key = randomUUID();
      const results = await Promise.all([
        importContract(sale, token, { idempotencyKey: key }).expect(201),
        importContract(sale, token, { idempotencyKey: key }).expect(201),
      ]);
      expect(results[0].body).toEqual(results[1].body);
      for (const table of ['leases', 'documents', 'domain_operation_receipts'])
        expect(
          await db.query(`SELECT * FROM ${table} WHERE company_id=$1`, [
            companyId,
          ]),
        ).toHaveLength(1);
      expect(
        await db.query('SELECT id FROM tenant_accounts WHERE company_id=$1', [
          companyId,
        ]),
      ).toHaveLength(sale ? 0 : 1);
      expect(await jobs()).toHaveLength(0);
    },
  );

  it('binds the import key to file bytes and terms, with HTTP company and role isolation', async () => {
    const key = randomUUID();
    await importContract(false, token, { idempotencyKey: key }).expect(201);
    const before = await snapshot();
    await importContract(false, token, {
      idempotencyKey: key,
      monthlyRent: '2000',
    }).expect(409);
    await importContract(
      false,
      token,
      { idempotencyKey: key },
      Buffer.from('Different file'),
    ).expect(409);
    await importContract(false, foreignToken, { idempotencyKey: key }).expect(
      404,
    );
    await importContract(false, tenantToken, { idempotencyKey: key }).expect(
      403,
    );
    await importContract(false, token, { idempotencyKey: 'not-a-uuid' }).expect(
      400,
    );
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back an imported contract, file, account and property when its receipt cannot be saved', async () => {
    const key = randomUUID(),
      before = await snapshot();
    await db.query(`CREATE OR REPLACE FUNCTION import_receipt_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.company_id='${companyId}'::uuid THEN RAISE EXCEPTION 'import receipt unavailable'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER import_receipt_test_fail BEFORE INSERT ON domain_operation_receipts FOR EACH ROW EXECUTE FUNCTION import_receipt_test_fail();`);
    try {
      await importContract(false, token, { idempotencyKey: key }).expect(500);
    } finally {
      await db.query(
        'DROP TRIGGER import_receipt_test_fail ON domain_operation_receipts; DROP FUNCTION import_receipt_test_fail()',
      );
    }
    await assertEmptyImport();
    expect(await snapshot()).toEqual(before);
    expect(
      await db.query(
        'SELECT * FROM domain_operation_receipts WHERE company_id=$1',
        [companyId],
      ),
    ).toHaveLength(0);
    await importContract(false, token, { idempotencyKey: key }).expect(201);
  });

  it('rolls back the entire import if loading its response fails', async () => {
    const before = await snapshot();
    const read = jest
      .spyOn(app.get(LeasesService), 'findOne')
      .mockRejectedValueOnce(new Error('import result failed'));
    try {
      await importContract(false, token, {
        idempotencyKey: randomUUID(),
      }).expect(500);
    } finally {
      read.mockRestore();
    }
    await assertEmptyImport();
    expect(await snapshot()).toEqual(before);
  });
});
