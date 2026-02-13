import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/users/entities/user.entity';
import { Company, PlanType } from '../src/companies/entities/company.entity';
import { Repository } from 'typeorm';

describe('Tenants Management (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let companyRepository: Repository<Company>;
  let ownerToken: string;
  let uniqueId: string;
  let shortId: string;
  let companyId: string;

  beforeAll(async () => {
    uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    shortId = uniqueId.slice(-8); // Short ID for DNI (max 20 chars)
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    userRepository = moduleFixture.get(getRepositoryToken(User));
    companyRepository = moduleFixture.get(getRepositoryToken(Company));

    await app.init();

    // Create company first
    const company = companyRepository.create({
      name: 'Tenant Test Company',
      taxId: `${shortId}-tenant`,
      plan: PlanType.BASIC,
    });
    const savedCompany = await companyRepository.save(company);
    companyId = savedCompany.id;

    // Create owner user for authentication with unique email
    const testEmail = `tenant-mgr-${shortId}@t-${shortId}.test`;
    const ownerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: testEmail,
        password: 'Password123!',
        firstName: 'Tenant',
        lastName: 'Manager',
        role: 'owner',
      });

    ownerToken = ownerRes.body.accessToken;

    if (!ownerToken) {
      throw new Error(`Failed to setup test user. Status: ${ownerRes.status}`);
    }
  });

  afterAll(async () => {
    // Clean up
    await userRepository.query(
      `DELETE FROM tenants WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@t-${shortId}.test')`,
    );
    await userRepository.query(
      `DELETE FROM users WHERE email LIKE '%@t-${shortId}.test'`,
    );
    await companyRepository.query(
      `DELETE FROM companies WHERE tax_id = '${shortId}-tenant'`,
    );
    await app.close();
  });

  describe('/tenants (POST)', () => {
    it('should create a tenant', () => {
      const tenantDto = {
        email: `newtenant@t-${shortId}.test`,
        password: 'Password123!',
        firstName: 'New',
        lastName: 'Tenant',
        phone: '+5491112345678',
        dni: `DNI${shortId}`,
        emergencyContact: 'Emergency Person',
        emergencyPhone: '+5491187654321',
        companyId,
      };

      return request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(tenantDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.email).toBe(tenantDto.email);
          expect(res.body.role).toBe('tenant');
        });
    });

    it('should fail with duplicate DNI', async () => {
      expect.hasAssertions();
      const tenantDto = {
        email: `dup-dni-1@t-${shortId}.test`,
        password: 'Password123!',
        firstName: 'Dup',
        lastName: 'DNI',
        phone: '+123',
        dni: `DUPDNI${shortId}`,
        companyId,
      };

      // Create first tenant
      await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(tenantDto)
        .expect(201);

      // Try to create second tenant with same DNI
      return request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          ...tenantDto,
          email: `dup-dni-2@t-${shortId}.test`,
        })
        .expect(409); // Conflict
    });

    it('should fail with duplicate email', async () => {
      expect.hasAssertions();
      const email = `dup-email@t-${shortId}.test`;

      // Create first tenant
      await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email,
          password: 'Password123!',
          firstName: 'First',
          lastName: 'Tenant',
          phone: '+123',
          dni: `DNI001${shortId}`,
          companyId,
        })
        .expect(201);

      // Try to create second tenant with same email
      return request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email,
          password: 'Password123!',
          firstName: 'Second',
          lastName: 'Tenant',
          phone: '+456',
          dni: `DNI002${shortId}`,
          companyId,
        })
        .expect(409);
    });
  });

  describe('/tenants (GET)', () => {
    beforeAll(async () => {
      // Create test tenants
      await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: `filter-1@t-${shortId}.test`,
          password: 'Password123!',
          firstName: 'Filter',
          lastName: 'One',
          phone: '+111',
          dni: `FLT001${shortId}`,
          companyId,
        });

      await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: `filter-2@t-${shortId}.test`,
          password: 'Password123!',
          firstName: 'Filter',
          lastName: 'Two',
          phone: '+222',
          dni: `FLT002${shortId}`,
          companyId,
        });
    });

    it('should get all tenants', () => {
      return request(app.getHttpServer())
        .get('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body).toHaveProperty('total');
        });
    });

    it('should filter tenants by name', () => {
      return request(app.getHttpServer())
        .get('/tenants?name=Filter')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeGreaterThan(0);
          expect(
            res.body.data.every(
              (t: any) =>
                t.firstName.includes('Filter') || t.lastName.includes('Filter'),
            ),
          ).toBe(true);
        });
    });

    it('should filter tenants by email', () => {
      return request(app.getHttpServer())
        .get('/tenants?email=filter-1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeGreaterThan(0);
          expect(res.body.data[0].email).toContain('filter-1');
        });
    });

    it('should support pagination', () => {
      return request(app.getHttpServer())
        .get('/tenants?page=1&limit=1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeLessThanOrEqual(1);
          expect(res.body.page).toBe(1);
          expect(res.body.limit).toBe(1);
        });
    });
  });

  describe('/tenants/:id (GET, PATCH, DELETE)', () => {
    let tenantId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: `crud-t@t-${shortId}.test`,
          password: 'Password123!',
          firstName: 'CRUD',
          lastName: 'Tenant',
          phone: '+999',
          dni: `CRUD${shortId}`,
          companyId,
        });

      tenantId = res.body.id;
    });

    it('should get tenant by id', () => {
      return request(app.getHttpServer())
        .get(`/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(tenantId);
          expect(res.body.email).toBe(`crud-t@t-${shortId}.test`);
        });
    });

    it('should update tenant information', () => {
      return request(app.getHttpServer())
        .patch(`/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          firstName: 'Updated',
          phone: '+1111111111',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.firstName).toBe('Updated');
          expect(res.body.phone).toBe('+1111111111');
        });
    });

    it('should get tenant lease history', () => {
      return request(app.getHttpServer())
        .get(`/tenants/${tenantId}/leases`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          // Empty array is fine since we haven't created leases for this tenant
        });
    });

    it('should delete tenant', () => {
      expect.hasAssertions();
      return request(app.getHttpServer())
        .delete(`/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
    });

    it('should not find deleted tenant', () => {
      expect.hasAssertions();
      return request(app.getHttpServer())
        .get(`/tenants/${tenantId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });
});
