import { randomUUID } from 'node:crypto';
import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { User, UserRole } from '../src/users/entities/user.entity';
import { Company } from '../src/companies/entities/company.entity';
import { AiToolExecutorService } from '../src/ai/ai-tool-executor.service';
import { AiExecutionContext } from '../src/ai/types/ai-tool.types';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('AI company and module authorization (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let executor: AiToolExecutorService;
  let company: Company;
  let foreignCompany: Company;
  let admin: User;
  let foreignUser: User;
  let staff: User;
  let adminToken: string;
  let staffToken: string;
  let context: AiExecutionContext;
  const suffix = randomUUID();
  const password = 'TestPassword123!';
  const previousMode = process.env.AI_TOOLS_MODE;

  beforeAll(async () => {
    process.env.AI_TOOLS_MODE = 'FULL';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    executor = app.get(AiToolExecutorService);
    const companies = db.getRepository(Company);
    company = await createTestCompany(companies, {
      name: 'AI authorized',
      taxId: `ai-a-${suffix}`,
    });
    foreignCompany = await createTestCompany(companies, {
      name: 'AI foreign',
      taxId: `ai-b-${suffix}`,
    });
    const users = app.get(UsersService);
    const create = (name: string, role: UserRole, companyId: string) =>
      createActiveTestUser(users, {
        email: `${name}-${suffix}@ai.test`,
        password,
        firstName: name,
        lastName: 'Fixture',
        role,
        companyId,
      });
    admin = await create('admin', UserRole.ADMIN, company.id);
    foreignUser = await create('foreign', UserRole.ADMIN, foreignCompany.id);
    staff = await create('staff', UserRole.STAFF, company.id);
    await db.getRepository(User).update(staff.id, {
      permissions: { ai: true, properties: false, users: true },
    });
    adminToken = await loginTestUser(app, admin.email!, password);
    staffToken = await loginTestUser(app, staff.email!, password);
    context = { userId: admin.id, companyId: company.id, role: UserRole.ADMIN };
  });

  afterAll(async () => {
    if (db && company && foreignCompany) {
      await db.query('DELETE FROM users WHERE company_id = ANY($1::uuid[])', [
        [company.id, foreignCompany.id],
      ]);
      await db.query('DELETE FROM companies WHERE id = ANY($1::uuid[])', [
        [company.id, foreignCompany.id],
      ]);
    }
    await app?.close();
    if (previousMode === undefined) delete process.env.AI_TOOLS_MODE;
    else process.env.AI_TOOLS_MODE = previousMode;
  });

  it('scopes HTTP and AI user reads to the authenticated company', async () => {
    const httpUser = await request(app.getHttpServer())
      .get(`/users/${foreignUser.id}`)
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    expect(httpUser.text).toBe('');
    const response = await request(app.getHttpServer())
      .post('/ai/tools/execute')
      .auth(adminToken, { type: 'bearer' })
      .send({ toolName: 'get_users_by_id', arguments: { id: foreignUser.id } })
      .expect(201);
    expect(response.body.result).toBeNull();
    const result = (await executor.execute('get_users', {}, context)) as {
      data: User[];
    };
    expect(result.data.map((user) => user.id)).toContain(admin.id);
    expect(result.data.every((user) => user.companyId === company.id)).toBe(
      true,
    );
    expect(result.data.some((user) => 'passwordHash' in user)).toBe(false);
  });

  it.each([
    ['patch_users_by_id', { firstName: 'Unauthorized' }],
    ['patch_users_activation_by_id', { isActive: false }],
    ['post_users_reset_password_by_id', { newPassword: 'ChangedPassword123!' }],
    ['delete_users_by_id', {}],
  ])(
    'keeps unsupported %s disabled without changing a foreign user',
    async (toolName, args) => {
      const before = await db
        .getRepository(User)
        .findOneByOrFail({ id: foreignUser.id });
      await expect(
        executor.executeApproved(
          toolName,
          { ...args, id: foreignUser.id },
          context,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        await db.getRepository(User).findOneByOrFail({ id: foreignUser.id }),
      ).toEqual(before);
    },
  );

  it.each(['post_users', 'post_auth_register'])(
    'keeps %s disabled for local and forged company IDs until transaction recovery exists',
    async (toolName) => {
      const args = {
        email: `${toolName}-${suffix}@ai.test`,
        password,
        firstName: 'Created',
        lastName: 'Fixture',
        role: UserRole.OWNER,
      };
      await expect(
        executor.executeApproved(
          toolName,
          { ...args, companyId: foreignCompany.id },
          context,
        ),
      ).rejects.toThrow();
      await expect(
        executor.executeApproved(toolName, args, context),
      ).rejects.toThrow('verified transactional');
      expect(
        await db.getRepository(User).findOneBy({ email: args.email }),
      ).toBeNull();
      expect(
        executor
          .listTools(UserRole.ADMIN)
          .find((tool) => tool.name === toolName)?.enabled,
      ).toBe(false);
    },
  );

  it('enforces current module permissions through the HTTP AI endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/ai/tools')
      .auth(staffToken, { type: 'bearer' })
      .expect(200);
    const names = response.body.tools.map(
      (tool: { name: string }) => tool.name,
    );
    expect(names).toContain('get_users_profile_me');
    expect(names).not.toContain('get_properties');
    expect(names).not.toContain('post_users');
    for (const toolName of [
      'get_properties',
      'post_properties',
      'post_users',
    ]) {
      await request(app.getHttpServer())
        .post('/ai/tools/execute')
        .auth(staffToken, { type: 'bearer' })
        .send({ toolName, arguments: {} })
        .expect(403);
      await expect(
        executor.executeApproved(
          toolName,
          {},
          {
            userId: staff.id,
            companyId: company.id,
            role: UserRole.STAFF,
            permissions: { ai: true, properties: false, users: true },
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    await db
      .getRepository(User)
      .update(staff.id, { permissions: { ai: true, properties: true } });
    await request(app.getHttpServer())
      .post('/ai/tools/execute')
      .auth(staffToken, { type: 'bearer' })
      .send({ toolName: 'get_properties', arguments: {} })
      .expect(201);
  });
});
