import { UserRole } from '../src/users/entities/user.entity';
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
  Property,
  PropertyType,
} from '../src/properties/entities/property.entity';
import {
  PortalListing,
  PortalName,
} from '../src/portals/entities/portal-listing.entity';
import { PortalPublicationOutboxService } from '../src/portals/portal-publication-outbox.service';
import {
  MercadoLibreClient,
  MercadoLibreItem,
} from '../src/integrations/mercadolibre.client';
import { ProviderConfigService } from '../src/integrations/provider-config.service';
import { ProviderRequestError } from '../src/integrations/provider-http.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  createSuperAdminTestUser,
  loginTestUser,
} from './e2e-helpers';

const item: MercadoLibreItem = {
  title: 'Apartment',
  category_id: 'MLA401686',
  price: 100000,
  currency_id: 'USD',
  available_quantity: 1,
  buying_mode: 'classified',
  listing_type_id: 'silver',
  condition: 'not_specified',
  pictures: [{ source: 'https://images.example.test/test.jpg' }],
  seller_contact: {
    contact: 'Agent',
    area_code: '11',
    phone: '44445555',
    country_code2: '54',
    area_code2: '11',
    phone2: '44446666',
  },
  location: { address_line: 'Test 100', city: { id: 'CITY1' } },
  attributes: [],
};
const remote = {
  id: 'MLA123',
  seller_id: 42,
  permalink: 'https://departamento.mercadolibre.com.ar/MLA123',
  status: 'active',
};

describe('Mercado Libre durable publications (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let companyId: string;
  let foreignId: string;
  let listingId: string;
  let adminId: string;
  let foreignListingId: string;
  let token: string;
  let foreignToken: string;
  let ownerToken: string;
  let enabled = false;
  let client: MercadoLibreClient;
  let create: jest.SpyInstance;
  let description: jest.SpyInstance;
  let status: jest.SpyInstance;
  let update: jest.SpyInstance;
  let get: jest.SpyInstance;
  const unique = randomUUID().slice(0, 20);
  const password = 'PortalTest123!';
  const worker = () => app.get(PortalPublicationOutboxService).processDue();
  const url = (suffix = '') => `/portals/listings/${listingId}${suffix}`;
  const post = (suffix: string, auth = token) =>
    request(app.getHttpServer())
      .post(url(suffix))
      .set('Authorization', `Bearer ${auth}`);
  const jobs = (): Promise<
    Array<{ id: string; status: string; operation: string }>
  > =>
    db.query(
      'SELECT * FROM portal_publication_outbox WHERE listing_id = $1 ORDER BY created_at',
      [listingId],
    );
  const listing = async () =>
    (
      await db.query('SELECT * FROM portal_listings WHERE id = $1', [listingId])
    )[0];
  const due = () =>
    db.query(
      'UPDATE portal_publication_outbox SET next_attempt_at = now() WHERE listing_id = $1',
      [listingId],
    );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    companyId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Portals',
        taxId: `portals-${unique}`,
      })
    ).id;
    foreignId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Foreign portals',
        taxId: `foreign-portals-${unique}`,
      })
    ).id;
    const makeToken = async (id: string) => {
      const email = `${id}@portals.test`;
      await createSuperAdminTestUser(
        app.get(UsersService),
        db.getRepository(Admin),
        {
          email,
          password,
          firstName: 'Portal',
          lastName: 'Test',
          companyId: id,
        },
      );
      return loginTestUser(app, email, password);
    };
    token = await makeToken(companyId);
    foreignToken = await makeToken(foreignId);
    const ownerEmail = `owner-${unique}@portals.test`;
    const ownerUser = await createActiveTestUser(app.get(UsersService), {
      email: ownerEmail,
      password,
      firstName: 'Owner',
      lastName: 'Test',
      companyId,
      role: UserRole.OWNER,
    });
    await db.query('INSERT INTO owners(company_id,user_id) VALUES($1,$2)', [
      companyId,
      ownerUser.id,
    ]);
    ownerToken = await loginTestUser(app, ownerEmail, password);
    const [user] = await db.query(
      "SELECT id FROM users WHERE company_id = $1 AND email = company_id::text || '@portals.test' LIMIT 1",
      [companyId],
    );
    const [owner] = await db.query(
      'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
      [companyId, user.id],
    );
    adminId = user.id;
    const [foreignUser] = await db.query(
      "SELECT id FROM users WHERE company_id = $1 AND email = company_id::text || '@portals.test'",
      [foreignId],
    );
    const [foreignOwner] = await db.query(
      'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
      [foreignId, foreignUser.id],
    );
    const foreignProperty = await db.getRepository(Property).save({
      companyId: foreignId,
      ownerId: foreignOwner.id,
      name: 'Foreign property',
      propertyType: PropertyType.APARTMENT,
      addressStreet: 'Other 100',
      addressCity: 'Buenos Aires',
      addressState: 'Buenos Aires',
    });
    foreignListingId = (
      await db.getRepository(PortalListing).save({
        companyId: foreignId,
        propertyId: foreignProperty.id,
        portal: PortalName.MERCADOLIBRE,
        listingData: { item },
      })
    ).id;

    const property = await db.getRepository(Property).save({
      companyId,
      ownerId: owner.id,
      name: 'Portal test',
      propertyType: PropertyType.APARTMENT,
      addressStreet: 'Test 100',
      addressCity: 'Buenos Aires',
      addressState: 'Buenos Aires',
    });
    listingId = (
      await db.getRepository(PortalListing).save({
        companyId,
        propertyId: property.id,
        portal: PortalName.MERCADOLIBRE,
        listingData: { item, description: 'Description' },
      })
    ).id;
    jest
      .spyOn(app.get(ProviderConfigService), 'enabled')
      .mockImplementation(() => enabled);
    client = app.get(MercadoLibreClient);
    create = jest.spyOn(client, 'create');
    description = jest.spyOn(client, 'upsertDescription');
    status = jest.spyOn(client, 'setStatus');
    update = jest.spyOn(client, 'update');
    get = jest.spyOn(client, 'get');
  });
  beforeEach(async () => {
    enabled = true;
    for (const spy of [create, description, status, update, get])
      spy.mockReset();
    create.mockResolvedValue(remote);
    description.mockResolvedValue({});
    status.mockImplementation(async (_company, _id, state) => ({
      ...remote,
      status: state,
    }));
    update.mockResolvedValue(remote);
    get.mockResolvedValue(remote);
    await db.query(
      'DELETE FROM portal_publication_resolutions WHERE listing_id = $1',
      [listingId],
    );
    await db.query(
      'UPDATE portal_listings SET external_id = NULL WHERE id = $1',
      [foreignListingId],
    );
    await db.query(
      'DELETE FROM portal_publication_outbox WHERE listing_id = $1',
      [listingId],
    );
    await db.query(
      "UPDATE portal_listings SET external_id = NULL, status = 'draft', provider_status = NULL, listing_data = $2::jsonb WHERE id = $1",
      [listingId, JSON.stringify({ item, description: 'Description' })],
    );
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    for (const id of [companyId, foreignId].filter(Boolean)) {
      for (const table of [
        'portal_publication_resolutions',
        'portal_publication_outbox',
        'portal_listings',
        'properties',
        'owners',
        'admins',
        'users',
        'companies',
      ]) {
        await db.query(
          `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'} = $1`,
          [id],
        );
      }
    }
    await app?.close();
  });

  it('does not enqueue or contact providers while disabled', async () => {
    enabled = false;
    await post('/publish').expect(503);
    await expect(worker()).resolves.toMatchObject({
      disabled: true,
      processed: 0,
    });
    expect(await jobs()).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
    const overview = await request(app.getHttpServer())
      .get(url('/operation'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(overview.body).toEqual({ enabled: false, job: null });
  });
  it('enforces authentication and company ownership before enqueueing or reading jobs', async () => {
    await request(app.getHttpServer()).post(url('/publish')).expect(401);
    await post('/publish', foreignToken).expect(404);
    await post('/pause', foreignToken).expect(404);
    await request(app.getHttpServer())
      .delete(url())
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(url())
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ listingData: { item } })
      .expect(404);
    await post('/publish', ownerToken).expect(403);
    await request(app.getHttpServer())
      .get(url('/operation'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(url('/operation'))
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    expect(await jobs()).toHaveLength(0);
  });
  it('deduplicates concurrent requests and publishes only after commit with concurrent workers', async () => {
    await Promise.all([
      post('/publish').expect(201),
      post('/publish').expect(201),
    ]);
    expect(await jobs()).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
    expect((await listing()).status).toBe('draft');
    await Promise.all([worker(), worker()]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await listing()).toMatchObject({
      status: 'published',
      external_id: 'MLA123',
      provider_status: 'active',
    });
    expect((await jobs())[0].status).toBe('completed');
  });
  it('never repeats an uncertain creation or overwrites its pending payload', async () => {
    create.mockRejectedValue(new ProviderRequestError('MERCADOLIBRE', true));
    await post('/publish').expect(201);
    await worker();
    await post('/publish').expect(201);
    await worker();
    expect(create).toHaveBeenCalledTimes(1);
    expect((await jobs())[0]).toMatchObject({
      status: 'needs_review',
      error_code: 'create_outcome_unknown',
    });
    await request(app.getHttpServer())
      .patch(url())
      .set('Authorization', `Bearer ${token}`)
      .send({ listingData: { item: { ...item, price: 90000 } } })
      .expect(409);
    expect((await listing()).listing_data.item.price).toBe(100000);
  });
  it('resumes description work using the durable external ID after a lost response', async () => {
    description
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValue({});
    await post('/publish').expect(201);
    await worker();
    expect(await listing()).toMatchObject({ external_id: 'MLA123' });
    expect((await jobs())[0].status).toBe('retry');
    await due();
    await worker();
    expect(create).toHaveBeenCalledTimes(1);
    expect(description).toHaveBeenCalledTimes(2);
    expect((await jobs())[0].status).toBe('completed');
  });
  it('requires review after a crash with a persisted creation intent', async () => {
    await post('/publish').expect(201);
    await db.query(
      "UPDATE portal_publication_outbox SET status = 'dispatching' WHERE listing_id = $1",
      [listingId],
    );
    await worker();
    expect(create).not.toHaveBeenCalled();
    expect((await jobs())[0].status).toBe('needs_review');
  });
  it('fences a late creation response after another worker has recovered the claim', async () => {
    let accepted!: () => void;
    const started = new Promise<void>((resolve) => {
      accepted = resolve;
    });
    let release!: (value: typeof remote) => void;
    create.mockImplementation(() => {
      accepted();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    await post('/publish').expect(201);
    const first = worker();
    await started;
    await db.query(
      "UPDATE portal_publication_outbox SET lease_expires_at = now() - interval '1 minute' WHERE listing_id = $1",
      [listingId],
    );
    await worker();
    release(remote);
    await first;
    expect(create).toHaveBeenCalledTimes(1);
    expect((await listing()).external_id).toBeNull();
    expect((await jobs())[0].status).toBe('needs_review');
  });
  it('updates, pauses, refreshes and closes the same external listing', async () => {
    await post('/publish').expect(201);
    await worker();
    await request(app.getHttpServer())
      .patch(url())
      .set('Authorization', `Bearer ${token}`)
      .send({ listingData: { item: { ...item, price: 90000 } } })
      .expect(200);
    expect(update).not.toHaveBeenCalled();
    await worker();
    await request(app.getHttpServer())
      .patch(url())
      .set('Authorization', `Bearer ${token}`)
      .send({
        listingData: { item: { ...item, price: 90000, currency_id: 'ARS' } },
      })
      .expect(400);
    expect(update).toHaveBeenCalledWith(
      companyId,
      'MLA123',
      expect.objectContaining({ price: 90000 }),
    );
    await post('/pause').expect(201);
    await worker();
    expect((await listing()).status).toBe('paused');
    await request(app.getHttpServer())
      .post('/portals/sync')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await worker();
    expect(get).toHaveBeenCalledWith(companyId, 'MLA123');
    await request(app.getHttpServer())
      .delete(url())
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await worker();
    expect((await listing()).status).toBe('removed');
    expect(create).toHaveBeenCalledTimes(1);
    await post('/publish').expect(409);
  });
  it('validates edited drafts without enqueueing incomplete or conflicting work', async () => {
    await request(app.getHttpServer())
      .patch(url())
      .set('Authorization', `Bearer ${token}`)
      .send({ listingData: { item: {} } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(url())
      .set('Authorization', `Bearer ${token}`)
      .send({ listingData: { item: { ...item, price: 80000 } } })
      .expect(200);
    expect(await jobs()).toHaveLength(0);
    expect((await listing()).listing_data.item.price).toBe(80000);
    await post('/pause').expect(409);
  });
  it('protects the worker with the internal credential and reports failed queues', async () => {
    const previous = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'portal-test-token';
    try {
      await request(app.getHttpServer())
        .post('/portals/internal/process-publications')
        .expect(401);
      enabled = false;
      const result = await request(app.getHttpServer())
        .post('/portals/internal/process-publications')
        .set('x-batch-communications-token', 'portal-test-token')
        .expect(201);
      expect(result.body.disabled).toBe(true);
    } finally {
      if (previous === undefined)
        delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
      else process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = previous;
    }
  });
  const review = (jobId: string, body: Record<string, unknown>, auth = token) =>
    post(`/operations/${jobId}/resolve`, auth).send({
      reason: 'Reviewed the seller account manually',
      ...body,
    });
  const uncertain = async () => {
    create.mockRejectedValueOnce(
      new ProviderRequestError('MERCADOLIBRE', true),
    );
    await post('/publish').expect(201);
    await worker();
    const [job] = await jobs();
    expect(job.status).toBe('needs_review');
    return job.id as string;
  };
  const resolutions = () =>
    db.query(
      'SELECT * FROM portal_publication_resolutions WHERE listing_id = $1',
      [listingId],
    );

  it('gates reviews by role, company and disabled state, while preserving local audit reads', async () => {
    const jobId = await uncertain();
    await request(app.getHttpServer())
      .post(url(`/operations/${jobId}/resolve`))
      .send({ action: 'retry', reason: 'Review account' })
      .expect(401);
    await review(jobId, { action: 'retry' }, ownerToken).expect(403);
    await review(jobId, { action: 'retry' }, foreignToken).expect(404);
    await request(app.getHttpServer())
      .get(url(`/operations/${jobId}/candidate/MLA123`))
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    enabled = false;
    await review(jobId, { action: 'link', externalId: 'MLA123' }).expect(503);
    await request(app.getHttpServer())
      .get(url(`/operations/${jobId}/candidate/MLA123`))
      .set('Authorization', `Bearer ${token}`)
      .expect(503);
    await request(app.getHttpServer())
      .get(url('/resolutions'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200, []);
    await request(app.getHttpServer())
      .get(url('/resolutions'))
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(url('/resolutions'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
    expect(get).not.toHaveBeenCalled();
    expect(await resolutions()).toHaveLength(0);
  });
  it('recovers a lost creation by verified ID without creating or reactivating an item', async () => {
    const jobId = await uncertain();
    await review(jobId, { action: 'retry' }).expect(409);
    get.mockResolvedValue({ ...remote, status: 'paused', title: 'Apartment' });
    const preview = await request(app.getHttpServer())
      .get(url(`/operations/${jobId}/candidate/MLA123`))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(preview.body.title).toBe('Apartment');
    expect((await listing()).external_id).toBeNull();
    const result = await review(jobId, {
      action: 'link',
      externalId: 'MLA123',
    }).expect(201);
    expect(result.body.actorId).toBe(adminId);
    expect(result.body.followupJobId).toBeTruthy();
    expect((await listing()).status).toBe('paused');
    expect((await jobs()).find((j) => j.id === jobId)!.status).toBe('resolved');
    expect(
      (await jobs()).find((j) => j.id === result.body.followupJobId)!.operation,
    ).toBe('refresh');
    await worker();
    expect(create).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    expect(description).toHaveBeenCalledWith(
      companyId,
      'MLA123',
      'Description',
    );
    expect((await listing()).status).toBe('paused');
    const [audit] = await resolutions();
    expect(audit.provider_snapshot.id).toBe('MLA123');
    expect(audit.actor_id).toBe(adminId);
    await review(jobId, { action: 'link', externalId: 'MLA123' }).expect(409);
    expect(await resolutions()).toHaveLength(1);
  });
  it('requires explicit manual absence review and a separate publication request', async () => {
    const jobId = await uncertain();
    await review(jobId, { action: 'confirm_not_created' }).expect(400);
    await review(jobId, {
      action: 'confirm_not_created',
      confirmedNoPublication: false,
    }).expect(400);
    await review(jobId, {
      action: 'confirm_not_created',
      confirmedNoPublication: true,
      reason: 'short',
    }).expect(400);
    await review(jobId, {
      action: 'confirm_not_created',
      confirmedNoPublication: true,
    }).expect(201);
    expect(await jobs()).toHaveLength(1);
    expect((await jobs())[0].status).toBe('resolved');
    await worker();
    expect(create).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    await post('/publish').expect(201);
    await worker();
    expect(create).toHaveBeenCalledTimes(2);
  });
  it('serializes competing reviews and records only one followup and audit entry', async () => {
    const jobId = await uncertain();
    const responses = await Promise.all([
      review(jobId, { action: 'link', externalId: 'MLA123' }),
      review(jobId, { action: 'link', externalId: 'MLA123' }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await resolutions()).toHaveLength(1);
    expect(await jobs()).toHaveLength(2);
  });
  it('rejects an ID already bound to another company and keeps the incident unchanged', async () => {
    const jobId = await uncertain();
    await db.query(
      'UPDATE portal_listings SET external_id = $2 WHERE id = $1',
      [foreignListingId, 'MLA123'],
    );
    await review(jobId, { action: 'link', externalId: 'MLA123' }).expect(409);
    expect((await listing()).external_id).toBeNull();
    expect((await jobs())[0].status).toBe('needs_review');
    expect(await resolutions()).toHaveLength(0);
  });
  it('keeps provider lookup failures unresolved and rejects stale results after another review', async () => {
    const jobId = await uncertain();
    get.mockRejectedValueOnce(
      new ProviderRequestError('MERCADOLIBRE', false, 403),
    );
    await review(jobId, { action: 'link', externalId: 'MLA123' }).expect(500);
    expect(await resolutions()).toHaveLength(0);
    get.mockImplementationOnce(async () => {
      await review(jobId, {
        action: 'confirm_not_created',
        confirmedNoPublication: true,
      }).expect(201);
      return remote;
    });
    await review(jobId, { action: 'link', externalId: 'MLA123' }).expect(409);
    expect((await listing()).external_id).toBeNull();
    expect(await resolutions()).toHaveLength(1);
  });
  it('retries operations on known IDs through a fresh job and can instead accept remote state', async () => {
    await post('/publish').expect(201);
    await worker();
    await post('/pause').expect(201);
    let job = (await jobs()).find((j) => j.operation === 'pause')!;
    await db.query(
      "UPDATE portal_publication_outbox SET status = 'needs_review' WHERE id = $1",
      [job.id],
    );
    const retry = await review(job.id, { action: 'retry' }).expect(201);
    await worker();
    expect(status).toHaveBeenCalledWith(companyId, 'MLA123', 'paused');
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      (await jobs()).find((j) => j.id === retry.body.followupJobId)!.status,
    ).toBe('completed');
    await post('/publish').expect(201);
    job = (await jobs()).find((j) => j.status === 'queued')!;
    await db.query(
      "UPDATE portal_publication_outbox SET status = 'needs_review' WHERE id = $1",
      [job.id],
    );
    get.mockResolvedValue({ ...remote, status: 'closed' });
    const accepted = await review(job.id, { action: 'accept_remote' }).expect(
      201,
    );
    expect(accepted.body.followupJobId).toBeNull();
    expect((await listing()).status).toBe('removed');
    expect((await jobs()).find((j) => j.id === job.id)!.status).toBe(
      'resolved',
    );
  });
  it('rejects reviews of older failed jobs after a new operation has been queued', async () => {
    create.mockRejectedValueOnce(
      new ProviderRequestError('MERCADOLIBRE', false, 400),
    );
    await post('/publish').expect(201);
    await worker();
    const [failed] = await jobs();
    await post('/publish').expect(201);
    await review(failed.id, { action: 'retry' }).expect(409);
    expect(await resolutions()).toHaveLength(0);
  });
  it('queues an authenticated per-listing refresh without creating or changing a publication', async () => {
    await post('/publish').expect(201);
    await worker();
    await post('/refresh', foreignToken).expect(404);
    await post('/refresh', ownerToken).expect(403);
    const queued = await post('/refresh').expect(201);
    expect(queued.body.job.operation).toBe('refresh');
    await worker();
    expect(get).toHaveBeenCalledWith(companyId, 'MLA123');
    expect(create).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
    enabled = false;
    await post('/refresh').expect(503);
  });
});
