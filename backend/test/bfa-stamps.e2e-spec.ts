import {
  Property,
  PropertyType,
} from '../src/properties/entities/property.entity';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { Admin } from '../src/users/entities/admin.entity';
import { UsersService } from '../src/users/users.service';
import {
  Document,
  DocumentType,
} from '../src/documents/entities/document.entity';
import { BfaClient } from '../src/integrations/bfa.client';
import { ProviderConfigService } from '../src/integrations/provider-config.service';
import { BfaStampsService } from '../src/digital-signatures/bfa-stamps.service';
import {
  configureE2eApp,
  createTestCompany,
  createSuperAdminTestUser,
  loginTestUser,
} from './e2e-helpers';

describe('BFA durable stamps (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let companyId: string;
  let foreignId: string;
  let documentId: string;
  let leaseId: string;
  let token: string;
  let foreignToken: string;
  let enabled = false;
  let verify: jest.SpyInstance;
  let submit: jest.SpyInstance;
  const unique = randomUUID();
  const password = 'BfaTest123!';
  const bytes = Buffer.from('%PDF-1.4\nBFA integrity test');
  const proof = {
    stamped: true,
    stamps: [
      {
        whostamped: '0x' + '1'.repeat(40),
        blocknumber: '1234',
        blocktimestamp: 1700000000,
      },
    ],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    const companyRepo = db.getRepository(Company);
    companyId = (
      await createTestCompany(companyRepo, {
        name: 'BFA',
        taxId: `bfa-${unique}`,
      })
    ).id;
    foreignId = (
      await createTestCompany(companyRepo, {
        name: 'Foreign BFA',
        taxId: `foreign-bfa-${unique}`,
      })
    ).id;
    const makeToken = async (id: string) => {
      const email = `${id}@bfa.test`;
      await createSuperAdminTestUser(
        app.get(UsersService),
        db.getRepository(Admin),
        { email, password, firstName: 'Bfa', lastName: 'Test', companyId: id },
      );
      return loginTestUser(app, email, password);
    };
    token = await makeToken(companyId);
    foreignToken = await makeToken(foreignId);
    const [user] = await db.query(
      'SELECT id FROM users WHERE company_id = $1 LIMIT 1',
      [companyId],
    );
    const [owner] = await db.query(
      'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
      [companyId, user.id],
    );
    const [buyer] = await db.query(
      'INSERT INTO buyers(company_id,user_id) VALUES($1,$2) RETURNING id',
      [companyId, user.id],
    );
    const property = await db.getRepository(Property).save({
      companyId,
      ownerId: owner.id,
      name: 'BFA document property',
      propertyType: PropertyType.APARTMENT,
      addressStreet: 'Test 100',
      addressCity: 'Buenos Aires',
      addressState: 'Buenos Aires',
    });
    const [lease] = await db.query(
      `INSERT INTO leases(company_id,property_id,owner_id,buyer_id,contract_type,fiscal_value)
      VALUES($1,$2,$3,$4,'sale',1000) RETURNING id`,
      [companyId, property.id, owner.id, buyer.id],
    );
    leaseId = lease.id;
    documentId = randomUUID();
    await db.getRepository(Document).save({
      id: documentId,
      companyId,
      entityType: 'lease',
      entityId: leaseId,
      documentType: DocumentType.OTHER,
      name: 'BFA test.pdf',
      fileUrl: `db://document/${documentId}`,
      fileData: bytes,
      fileMimeType: 'application/pdf',
      fileSize: bytes.length,
    });
    jest
      .spyOn(app.get(ProviderConfigService), 'enabled')
      .mockImplementation(() => enabled);
    verify = jest
      .spyOn(app.get(BfaClient), 'verify')
      .mockResolvedValue({ stamped: false, stamps: [] });
    submit = jest
      .spyOn(app.get(BfaClient), 'submit')
      .mockResolvedValue(undefined);
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (companyId) {
      await db.query('DELETE FROM document_bfa_stamps WHERE company_id = $1', [
        companyId,
      ]);
      await db.query('DELETE FROM documents WHERE company_id = $1', [
        companyId,
      ]);
    }
    for (const id of [companyId, foreignId].filter(Boolean)) {
      for (const table of ['leases', 'properties', 'buyers', 'owners']) {
        await db.query(`DELETE FROM ${table} WHERE company_id = $1`, [id]);
      }
      await db.query('DELETE FROM admins WHERE company_id = $1', [id]);
      await db.query('DELETE FROM users WHERE company_id = $1', [id]);
      await db.query('DELETE FROM companies WHERE id = $1', [id]);
    }
    await app?.close();
  });
  const url = () => `/digital-signatures/documents/${documentId}/stamp`;
  const due = () =>
    db.query(
      'UPDATE document_bfa_stamps SET next_attempt_at = NOW() WHERE company_id = $1',
      [companyId],
    );
  const state = async () =>
    (
      await db.query(
        'SELECT * FROM document_bfa_stamps WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1',
        [documentId],
      )
    )[0];

  it('keeps the unconfigured integration disabled with no queued jobs or provider traffic', async () => {
    await request(app.getHttpServer())
      .post(url())
      .set('Authorization', `Bearer ${token}`)
      .expect(503);
    await expect(app.get(BfaStampsService).processDue()).resolves.toMatchObject(
      { disabled: true, processed: 0 },
    );
    expect(await state()).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it('lists persisted PDFs without provider traffic and isolates the lease overview', async () => {
    const path = `/digital-signatures/bfa/leases/${leaseId}`;
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.enabled).toBe(false);
    expect(response.body.documents).toHaveLength(1);
    expect(response.body.documents[0]).toMatchObject({
      id: documentId,
      status: null,
      currentVersion: true,
    });
    expect(response.body.documents[0]).not.toHaveProperty('file_data');
    expect(verify).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it('requires authenticated company ownership and deduplicates concurrent requests', async () => {
    enabled = true;
    await request(app.getHttpServer()).post(url()).expect(401);
    await request(app.getHttpServer())
      .post(url())
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(url())
          .set('Authorization', `Bearer ${token}`)
          .expect(201),
      ),
    );
    expect(results[0].body.id).toBe(results[1].body.id);
    expect(results[0].body.sha256).toBe(app.get(BfaClient).digest(bytes));
    expect(submit).not.toHaveBeenCalled();
  });
  it('claims submission once across workers and never resubmits an ambiguous POST', async () => {
    submit.mockRejectedValueOnce(new Error('response lost'));
    await Promise.all([
      app.get(BfaStampsService).processDue(),
      app.get(BfaStampsService).processDue(),
    ]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(await state()).toMatchObject({ status: 'submitted', proof: null });
    await due();
    await app.get(BfaStampsService).processDue();
    expect(submit).toHaveBeenCalledTimes(1);
    verify.mockResolvedValue(proof);
    await due();
    await app.get(BfaStampsService).processDue();
    expect(await state()).toMatchObject({ status: 'stamped', proof });
    const response = await request(app.getHttpServer())
      .get(url())
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.proof).toEqual(proof);
    await request(app.getHttpServer())
      .get(url())
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
  });
  it('keeps historical proof readable while disabled and makes no further requests', async () => {
    enabled = false;
    const calls = verify.mock.calls.length;
    await request(app.getHttpServer())
      .get(url())
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await app.get(BfaStampsService).processDue();
    expect(verify).toHaveBeenCalledTimes(calls);
  });
  it('rejects a changed document before contacting BFA', async () => {
    enabled = true;
    const calls = verify.mock.calls.length;
    await db.query(
      "UPDATE document_bfa_stamps SET status = 'queued', next_attempt_at = NOW() WHERE document_id = $1",
      [documentId],
    );
    await db.query('UPDATE documents SET file_data = $2 WHERE id = $1', [
      documentId,
      Buffer.from('changed'),
    ]);
    await app.get(BfaStampsService).processDue();
    expect(await state()).toMatchObject({
      status: 'needs_review',
      error_code: 'document_changed',
    });
    expect(verify).toHaveBeenCalledTimes(calls);
    const overview = await request(app.getHttpServer())
      .get(`/digital-signatures/bfa/leases/${leaseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(overview.body.documents[0]).toMatchObject({
      currentVersion: false,
      status: 'needs_review',
    });
  });
  it('protects the worker with the batch credential even while disabled', async () => {
    const previous = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'bfa-test-token';
    enabled = false;
    try {
      await request(app.getHttpServer())
        .post('/digital-signatures/internal/process-stamps')
        .expect(401);
      const response = await request(app.getHttpServer())
        .post('/digital-signatures/internal/process-stamps')
        .set('x-batch-communications-token', 'bfa-test-token')
        .expect(201);
      expect(response.body.disabled).toBe(true);
    } finally {
      if (previous === undefined)
        delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
      else process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = previous;
    }
  });
});
