import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../src/users/entities/user.entity';
import { Repository } from 'typeorm';

describe('Role-Based Access Control (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    userRepository = moduleFixture.get(getRepositoryToken(User));

    await app.init();

    // Create Admin User
    const adminEmail = `admin@roles-${uniqueId}.test`;
    const adminPassword = 'Password123!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: adminEmail,
        password: adminPassword,
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
      })
      .expect(201)
      .then((res) => {
        console.log('Admin Register Response:', res.body);
        adminToken = res.body.accessToken;
      });

    // Create Tenant User
    const tenantEmail = `tenant@roles-${uniqueId}.test`;
    const tenantPassword = 'Password123!';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: tenantEmail,
        password: tenantPassword,
        firstName: 'Tenant',
        lastName: 'User',
        role: UserRole.TENANT,
      })
      .expect(201)
      .then((res) => {
        console.log('Tenant Register Response:', res.body);
        tenantToken = res.body.accessToken;
      });
  });

  afterAll(async () => {
    // Clean up test data
    if (userRepository) {
      await userRepository.query(
        `DELETE FROM users WHERE email LIKE '%@roles-${uniqueId}.test'`,
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
