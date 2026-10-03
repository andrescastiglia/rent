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
import { Tenant } from '../src/tenants/entities/tenant.entity';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from '../src/payments/entities/payment.entity';
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
      await db.query(
        'DELETE FROM payments WHERE company_id = ANY($1::uuid[])',
        [[company.id, foreignCompany.id]],
      );
      await db.query('DELETE FROM tenants WHERE company_id = ANY($1::uuid[])', [
        [company.id, foreignCompany.id],
      ]);
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

  it('provides password help in READONLY without a provider and sends no web actions to mobile', async () => {
    process.env.AI_TOOLS_MODE = 'READONLY';
    try {
      const response = await request(app.getHttpServer())
        .post('/ai/tools/respond')
        .auth(adminToken, { type: 'bearer' })
        .send({
          prompt: 'quiero cambiar la password',
          channel: 'web',
          currentPath: '/es/properties',
        })
        .expect(201);
      expect(response.body.uiAction).toEqual({
        type: 'navigate',
        path: '/settings',
        guide: 'password',
      });
      expect(response.body.outputText).toContain('contraseña actual');
      const mobile = await request(app.getHttpServer())
        .post('/ai/tools/respond')
        .auth(adminToken, { type: 'bearer' })
        .send({ prompt: 'quiero cambiar la password', channel: 'mobile' })
        .expect(201);
      expect(mobile.body).not.toHaveProperty('uiAction');
      await request(app.getHttpServer())
        .post('/ai/tools/respond')
        .auth(adminToken, { type: 'bearer' })
        .send({ prompt: 'password', channel: 'whatsapp' })
        .expect(400);
    } finally {
      process.env.AI_TOOLS_MODE = 'FULL';
    }
  });

  it('returns full daily currency totals with bounded details and excludes foreign, deleted and incomplete payments', async () => {
    const users = app.get(UsersService);
    const tenantUser = await createActiveTestUser(users, {
      email: `collections-${suffix}@ai.test`,
      password,
      firstName: 'Collections',
      lastName: 'Fixture',
      role: UserRole.TENANT,
      companyId: company.id,
    });
    const foreignTenantUser = await createActiveTestUser(users, {
      email: `foreign-collections-${suffix}@ai.test`,
      password,
      firstName: 'Foreign',
      lastName: 'Fixture',
      role: UserRole.TENANT,
      companyId: foreignCompany.id,
    });
    const tenant = await db
      .getRepository(Tenant)
      .save({ userId: tenantUser.id, companyId: company.id });
    const foreignTenant = await db
      .getRepository(Tenant)
      .save({ userId: foreignTenantUser.id, companyId: foreignCompany.id });
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const payments = db.getRepository(Payment);
    const base = {
      companyId: company.id,
      tenantId: tenant.id,
      method: PaymentMethod.CASH,
      currencyCode: 'ARS',
      paymentDate: new Date(`${today}T12:00:00Z`),
      status: PaymentStatus.COMPLETED,
    };
    await payments.save([
      ...Array.from({ length: 23 }, () => ({ ...base, amount: 10.1 })),
      { ...base, currencyCode: 'USD', amount: 3.03 },
      { ...base, amount: 100, refundedAmount: 20 },
      { ...base, amount: 1000, status: PaymentStatus.PENDING },
      { ...base, amount: 2000, status: PaymentStatus.CANCELLED },
      { ...base, amount: 3000, deletedAt: new Date() },
      { ...base, amount: 4000, paymentDate: new Date('2020-01-01T12:00:00Z') },
      {
        ...base,
        amount: 5000,
        companyId: foreignCompany.id,
        tenantId: foreignTenant.id,
      },
    ]);
    const summary = await request(app.getHttpServer())
      .post('/ai/tools/execute')
      .auth(adminToken, { type: 'bearer' })
      .send({
        toolName: 'get_payments_collection_summary',
        arguments: { fromDate: today, toDate: today },
      })
      .expect(201);
    expect(summary.body.result.totalCount).toBe(25);
    expect(summary.body.result.details).toHaveLength(20);
    expect(summary.body.result.totals).toEqual([
      { currency: 'ARS', amount: '312.30', count: 24 },
      { currency: 'USD', amount: '3.03', count: 1 },
    ]);
    const response = await request(app.getHttpServer())
      .post('/ai/tools/respond')
      .auth(adminToken, { type: 'bearer' })
      .send({ prompt: 'quiero ver la cobranza del dia de hoy', channel: 'web' })
      .expect(201);
    expect(response.body.outputText).toContain('ARS 312,30');
    expect(response.body.outputText).toContain('USD 3,03');
    expect(response.body.outputText).toContain('Mostrando 20 de 25');
    expect(response.body).not.toHaveProperty('uiAction');
    await request(app.getHttpServer())
      .post('/ai/tools/respond')
      .auth(staffToken, { type: 'bearer' })
      .send({ prompt: 'cobranza de hoy', channel: 'web' })
      .expect(403);
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
