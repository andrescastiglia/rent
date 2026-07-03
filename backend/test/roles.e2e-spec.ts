import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../src/users/entities/user.entity';
import { Company, PlanType } from '../src/companies/entities/company.entity';
import { Repository } from 'typeorm';
import { UsersService } from '../src/users/users.service';
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

    await app.init();

    const company = await companyRepository.save(
      companyRepository.create({
        name: 'Roles Test Company',
        taxId: `${uniqueId}-roles`,
        plan: PlanType.BASIC,
      }),
    );

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
  });

  afterAll(async () => {
    // Clean up test data
    if (userRepository) {
      await userRepository.query(
        `DELETE FROM admins WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@roles-${uniqueId}.test')`,
      );
      await userRepository.query(
        `DELETE FROM users WHERE email LIKE '%@roles-${uniqueId}.test'`,
      );
      await companyRepository.query(
        `DELETE FROM companies WHERE tax_id = '${uniqueId}-roles'`,
      );
    }
    await app.close();
  });

  describe('OwnersController RBAC', () => {
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
