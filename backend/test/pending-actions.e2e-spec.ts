import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { User, UserRole } from '../src/users/entities/user.entity';
import { Company } from '../src/companies/entities/company.entity';
import { AiToolExecutorService } from '../src/ai/ai-tool-executor.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Pending action claims with PostgreSQL (e2e)', () => {
  let app: INestApplication, db: DataSource;
  let company: Company, foreignCompany: Company;
  let requester: User, reviewer: User, foreignReviewer: User, deniedStaff: User;
  let reviewerToken: string,
    requesterToken: string,
    foreignToken: string,
    staffToken: string;
  let reauth: string, foreignReauth: string, selfReauth: string;
  let execute: jest.SpyInstance;
  const suffix = randomUUID(),
    password = 'TestPassword123!';
  const payload = { name: 'Approved fixture' };
  const hash = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    company = await createTestCompany(db.getRepository(Company), {
      name: 'Approval company',
      taxId: `pending-a-${suffix}`,
    });
    foreignCompany = await createTestCompany(db.getRepository(Company), {
      name: 'Foreign approvals',
      taxId: `pending-b-${suffix}`,
    });
    const users = app.get(UsersService);
    const create = (name: string, role: UserRole, companyId = company.id) =>
      createActiveTestUser(users, {
        email: `${name}-${suffix}@pending.test`,
        password,
        firstName: name,
        lastName: 'Fixture',
        role,
        companyId,
      });
    requester = await create('requester', UserRole.ADMIN);
    reviewer = await create('reviewer', UserRole.ADMIN);
    foreignReviewer = await create(
      'foreign',
      UserRole.ADMIN,
      foreignCompany.id,
    );
    deniedStaff = await create('denied', UserRole.STAFF);
    await db
      .getRepository(User)
      .update(deniedStaff.id, { permissions: { approvals: false } });
    reviewerToken = await loginTestUser(app, reviewer.email!, password);
    requesterToken = await loginTestUser(app, requester.email!, password);
    foreignToken = await loginTestUser(app, foreignReviewer.email!, password);
    staffToken = await loginTestUser(app, deniedStaff.email!, password);
    const authenticate = async (token: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/reauthenticate')
          .auth(token, { type: 'bearer' })
          .send({ password })
          .expect(200)
      ).body.reauthToken as string;
    reauth = await authenticate(reviewerToken);
    foreignReauth = await authenticate(foreignToken);
    selfReauth = await authenticate(requesterToken);
    // Claims are real SQL; the bounded tool spy records dispatches without domain/provider effects.
    execute = jest.spyOn(app.get(AiToolExecutorService), 'executeApproved');
  });
  beforeEach(() =>
    execute.mockReset().mockResolvedValue({ id: 'fixture-result' }),
  );
  afterAll(async () => {
    execute?.mockRestore();
    if (db && company && foreignCompany) {
      const ids = [company.id, foreignCompany.id];
      await db.query(
        'DELETE FROM pending_actions WHERE company_id=ANY($1::uuid[])',
        [ids],
      );
      await db.query('DELETE FROM users WHERE company_id=ANY($1::uuid[])', [
        ids,
      ]);
      await db.query('DELETE FROM companies WHERE id=ANY($1::uuid[])', [ids]);
    }
    await app?.close();
  });
  const seed = async (
    options: { expired?: boolean; corrupt?: boolean } = {},
  ) => {
    const [row] = await db.query(
      `INSERT INTO pending_actions(company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,expires_at)
      VALUES($1,$2,'create_fixture','create','fixture','Create fixture',$3::jsonb,$4,now()+$5::interval) RETURNING *`,
      [
        company.id,
        requester.id,
        JSON.stringify(payload),
        options.corrupt ? 'a'.repeat(64) : hash,
        options.expired ? '-1 minute' : '15 minutes',
      ],
    );
    return row;
  };
  const approve = (id: string, token = reviewerToken, reauthToken = reauth) =>
    request(app.getHttpServer())
      .post(`/pending-actions/${id}/approve`)
      .auth(token, { type: 'bearer' })
      .send({ reauthToken });
  const reject = (id: string, token = reviewerToken) =>
    request(app.getHttpServer())
      .post(`/pending-actions/${id}/reject`)
      .auth(token, { type: 'bearer' })
      .send({ reason: '  Rejected fixture  ' });
  const read = async (id: string) =>
    (await db.query('SELECT * FROM pending_actions WHERE id=$1', [id]))[0];

  it('dispatches a claimed row with its original payload/key and persists the result', async () => {
    const row = await seed();
    const response = await approve(row.id).expect(201);
    expect(response.body).toMatchObject({
      id: row.id,
      status: 'executed',
      reviewed_by: reviewer.id,
      result: { id: 'fixture-result' },
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      'create_fixture',
      payload,
      expect.objectContaining({
        companyId: company.id,
        userId: reviewer.id,
        idempotencyKey: row.execution_key,
      }),
    );
    await approve(row.id).expect(400);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('allows only one concurrent approval to dispatch', async () => {
    const row = await seed();
    const responses = await Promise.all([approve(row.id), approve(row.id)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await read(row.id)).status).toBe('executed');
  });
  it('rejects once and detects zero returned rows for repeats or missing IDs', async () => {
    const row = await seed();
    const response = await reject(row.id).expect(201);
    expect(response.body).toMatchObject({
      status: 'rejected',
      error_message: 'Rejected fixture',
    });
    await reject(row.id).expect(400);
    await reject(randomUUID()).expect(400);
    await approve(row.id).expect(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('serializes competing approval and rejection without overwriting the winner', async () => {
    const row = await seed();
    const [approval, rejection] = await Promise.all([
      approve(row.id),
      reject(row.id),
    ]);
    expect([approval.status, rejection.status].sort()).toEqual([201, 400]);
    const stored = await read(row.id);
    expect(stored.status).toBe(
      approval.status === 201 ? 'executed' : 'rejected',
    );
    expect(execute).toHaveBeenCalledTimes(approval.status === 201 ? 1 : 0);
  });
  it('denies another company, missing authorization and staff without approval capability', async () => {
    const row = await seed();
    await approve(row.id, foreignToken, foreignReauth).expect(400);
    await reject(row.id, foreignToken).expect(400);
    await approve(row.id, staffToken).expect(403);
    await reject(row.id, staffToken).expect(403);
    await request(app.getHttpServer())
      .post(`/pending-actions/${row.id}/approve`)
      .send({ reauthToken: reauth })
      .expect(401);
    await approve(row.id, reviewerToken, foreignReauth).expect(401);
    await approve(row.id, reviewerToken, 'invalid').expect(400);
    const badSignature = `${reauth.split('.').slice(0, 2).join('.')}.${Buffer.from('invalid-signature').toString('base64url')}`;
    await approve(row.id, reviewerToken, badSignature).expect(401);
    expect((await read(row.id)).status).toBe('pending');
    expect(execute).not.toHaveBeenCalled();
    const listed = await request(app.getHttpServer())
      .get('/pending-actions')
      .auth(foreignToken, { type: 'bearer' })
      .expect(200);
    expect(listed.body).toEqual([]);
  });
  it('rejects self approval, expired proposals and corrupt payload hashes before dispatch', async () => {
    const row = await seed();
    await approve(row.id, requesterToken, selfReauth).expect(400);
    expect((await read(row.id)).status).toBe('pending');
    const expired = await seed({ expired: true });
    await approve(expired.id).expect(400);
    expect((await read(expired.id)).status).toBe('expired');
    const corrupt = await seed({ corrupt: true });
    await approve(corrupt.id).expect(400);
    expect((await read(corrupt.id)).status).toBe('failed');
    expect(execute).not.toHaveBeenCalled();
  });
  it('persists a tool failure and never redispatches a failed claim', async () => {
    const row = await seed();
    execute.mockRejectedValueOnce(new Error('Fixture validation failed'));
    const response = await approve(row.id).expect(201);
    expect(response.body).toMatchObject({
      status: 'failed',
      error_message: 'Fixture validation failed',
    });
    await approve(row.id).expect(400);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
