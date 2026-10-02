import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../src/users/entities/user.entity';
import { Company, PlanType } from '../src/companies/entities/company.entity';
import { Repository } from 'typeorm';
import { UsersService } from '../src/users/users.service';
import { Owner } from '../src/owners/entities/owner.entity';
import {
  configureE2eApp,
  createActiveTestUser,
  loginTestUser,
} from './e2e-helpers';

describe('Role-Based Access Control (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let companyRepository: Repository<Company>;
  let usersService: UsersService;
  let uniqueId: string;
  let companyId: string;
  let foreignCompanyId: string;
  let ownerRepository: Repository<Owner>;
  let allowedStaffToken: string;
  let deniedStaffToken: string;
  let ownerToken: string;
  let buyerToken: string;
  let foreignToken: string;

  // Test users
  let adminToken: string;
  let tenantToken: string;

  beforeAll(async () => {
    uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureE2eApp(app);

    userRepository = moduleFixture.get(getRepositoryToken(User));
    companyRepository = moduleFixture.get(getRepositoryToken(Company));
    usersService = moduleFixture.get(UsersService);
    ownerRepository = moduleFixture.get(getRepositoryToken(Owner));

    await app.init();

    const company = await companyRepository.save(
      companyRepository.create({
        name: 'Roles Test Company',
        taxId: `${uniqueId}-roles`,
        plan: PlanType.BASIC,
      }),
    );
    companyId = company.id;
    foreignCompanyId = (
      await companyRepository.save(
        companyRepository.create({
          name: 'Foreign owner directory',
          taxId: `${uniqueId}-foreign-roles`,
          plan: PlanType.BASIC,
        }),
      )
    ).id;

    // Create Admin User
    const adminEmail = `admin@roles-${uniqueId}.test`;
    const adminPassword = 'Password123!';
    await createActiveTestUser(usersService, {
      email: adminEmail,
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      companyId: company.id,
    });
    adminToken = await loginTestUser(app, adminEmail, adminPassword);

    // Create Tenant User
    const tenantEmail = `tenant@roles-${uniqueId}.test`;
    const tenantPassword = 'Password123!';
    await createActiveTestUser(usersService, {
      email: tenantEmail,
      password: tenantPassword,
      firstName: 'Tenant',
      lastName: 'User',
      role: UserRole.TENANT,
      companyId: company.id,
    });
    tenantToken = await loginTestUser(app, tenantEmail, tenantPassword);

    const account = async (
      name: string,
      role: UserRole,
      id = companyId,
      permissions = {},
    ) => {
      const user = await createActiveTestUser(usersService, {
        companyId: id,
        email: `${name}@roles-${uniqueId}.test`,
        password: adminPassword,
        firstName: name,
        lastName: 'Role test',
        role,
      });
      await userRepository.update(user.id, { permissions });
      return loginTestUser(app, user.email!, adminPassword);
    };
    allowedStaffToken = await account(
      'allowed-staff',
      UserRole.STAFF,
      companyId,
      { owners: true },
    );
    deniedStaffToken = await account('denied-staff', UserRole.STAFF);
    ownerToken = await account('owner-account', UserRole.OWNER);
    buyerToken = await account('buyer-account', UserRole.BUYER);
    foreignToken = await account(
      'foreign-admin',
      UserRole.ADMIN,
      foreignCompanyId,
    );
    for (const [id, name, surname, phone] of [
      [companyId, 'Ana', 'Alpha', '111'],
      [companyId, 'Luis', 'Beta', '222'],
      [companyId, 'Third page', 'Zulu', 'later-phone'],
      [foreignCompanyId, 'Foreign', 'Only', '999'],
    ]) {
      const contact = await userRepository.save(
        userRepository.create({
          companyId: id,
          firstName: name,
          lastName: surname,
          phone,
          role: UserRole.OWNER,
          roles: [UserRole.OWNER],
          email: null,
          passwordHash: 'disabled-fixture',
          isActive: false,
          accessRequested: false,
        }),
      );
      await ownerRepository.save(
        ownerRepository.create({ companyId: id, userId: contact.id }),
      );
    }
  });

  afterAll(async () => {
    try {
      for (const id of [companyId, foreignCompanyId].filter(Boolean)) {
        await ownerRepository.query('DELETE FROM owners WHERE company_id=$1', [
          id,
        ]);
        await userRepository.query('DELETE FROM admins WHERE company_id=$1', [
          id,
        ]);
        await userRepository.query('DELETE FROM users WHERE company_id=$1', [
          id,
        ]);
        await companyRepository.delete(id);
      }
    } finally {
      await app?.close();
    }
  });

  describe('OwnersController RBAC', () => {
    it('finds contacts beyond the first page and reports the whole company total', async () => {
      const first = await request(app.getHttpServer())
        .get('/owners/page?limit=1&page=1')
        .auth(adminToken, { type: 'bearer' })
        .expect(200);
      const third = await request(app.getHttpServer())
        .get('/owners/page?limit=1&page=3')
        .auth(adminToken, { type: 'bearer' })
        .expect(200);
      expect(first.body).toMatchObject({ total: 3, page: 1, limit: 1 });
      expect(first.body.data[0].user.lastName).toBe('Alpha');
      expect(third.body).toMatchObject({ total: 3, page: 3, limit: 1 });
      expect(third.body.data[0].user.lastName).toBe('Zulu');
      expect(third.body.data[0].user.isActive).toBe(false);
      const result = await request(app.getHttpServer())
        .get('/owners/page?search=later-phone&limit=1')
        .auth(adminToken, { type: 'bearer' })
        .expect(200);
      expect(result.body.total).toBe(1);
      expect(result.body.data[0].user.firstName).toBe('Third page');
    });

    it('scopes search and pagination separately for two companies', async () => {
      const source = await request(app.getHttpServer())
        .get('/owners/page?search=Foreign')
        .auth(adminToken, { type: 'bearer' })
        .expect(200);
      expect(source.body).toMatchObject({ data: [], total: 0 });
      const foreign = await request(app.getHttpServer())
        .get('/owners/page')
        .auth(foreignToken, { type: 'bearer' })
        .expect(200);
      expect(foreign.body.total).toBe(1);
      expect(foreign.body.data[0].companyId).toBe(foreignCompanyId);
      expect(foreign.body.data[0].user.firstName).toBe('Foreign');
      await request(app.getHttpServer())
        .get(`/owners/page?companyId=${foreignCompanyId}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(400);
    });

    it('honors staff module permission on the paginated endpoint', async () => {
      const result = await request(app.getHttpServer())
        .get('/owners/page')
        .auth(allowedStaffToken, { type: 'bearer' })
        .expect(200);
      expect(result.body.total).toBe(3);
      await request(app.getHttpServer())
        .get('/owners/page')
        .auth(deniedStaffToken, { type: 'bearer' })
        .expect(403);
    });

    it('rejects external roles and unauthenticated paginated directory reads', async () => {
      for (const token of [tenantToken, ownerToken, buyerToken])
        await request(app.getHttpServer())
          .get('/owners/page')
          .auth(token, { type: 'bearer' })
          .expect(403);
      await request(app.getHttpServer()).get('/owners/page').expect(401);
    });

    it('validates page bounds and supports stable reverse name ordering', async () => {
      for (const query of [
        'page=0',
        'page=1.5',
        'limit=101',
        'limit=0',
        'sortOrder=invalid',
      ])
        await request(app.getHttpServer())
          .get(`/owners/page?${query}`)
          .auth(adminToken, { type: 'bearer' })
          .expect(400);
      const result = await request(app.getHttpServer())
        .get('/owners/page?sortOrder=DESC&limit=1')
        .auth(adminToken, { type: 'bearer' })
        .expect(200);
      expect(result.body.data[0].user.lastName).toBe('Zulu');
    });
    it('should allow Admin to access owners list', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer())
        .get('/owners')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.status).toBe(200);
    });

    it('should deny Tenant access to owners list', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer())
        .get('/owners')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(403);

      expect(res.status).toBe(403);
    });

    it('should deny unauthenticated access to owners list', async () => {
      expect.hasAssertions();
      expect(true).toBe(true);
      const res = await request(app.getHttpServer()).get('/owners').expect(401);

      expect(res.status).toBe(401);
    });
  });
});
