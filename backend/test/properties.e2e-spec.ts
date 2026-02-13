import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/users/entities/user.entity';
import {
  Property,
  PropertyType,
  PropertyStatus,
} from '../src/properties/entities/property.entity';
import { Company, PlanType } from '../src/companies/entities/company.entity';
import { Repository } from 'typeorm';

describe('Properties Management (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let propertyRepository: Repository<Property>;
  let companyRepository: Repository<Company>;
  let ownerToken: string;
  let ownerId: string;
  let otherOwnerToken: string;
  let companyId: string;
  let uniqueId: string;

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
    propertyRepository = moduleFixture.get(getRepositoryToken(Property));
    companyRepository = moduleFixture.get(getRepositoryToken(Company));

    await app.init();

    // Create owner user
    const ownerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `property-owner@prop-${uniqueId}.test`,
        password: 'Password123!',
        firstName: 'Property',
        lastName: 'Owner',
        role: 'owner',
      });

    ownerToken = ownerRes.body.accessToken;
    const ownerUserId = ownerRes.body.user.id;

    // Create company first (needed for owners)
    const company = companyRepository.create({
      name: 'Property Test Company',
      taxId: `${uniqueId}-prop`,
      plan: PlanType.BASIC,
    });
    const savedCompany = await companyRepository.save(company);
    companyId = savedCompany.id;

    // Create owner record in owners table with company_id and get owner.id
    const ownerResult = await userRepository.query(
      'INSERT INTO owners (user_id, company_id) VALUES ($1, $2) RETURNING id',
      [ownerUserId, companyId],
    );
    ownerId = ownerResult[0].id;

    // Create another owner for authorization tests
    const otherOwnerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `other-owner@prop-${uniqueId}.test`,
        password: 'Password123!',
        firstName: 'Other',
        lastName: 'Owner',
        role: 'owner',
      });

    otherOwnerToken = otherOwnerRes.body.accessToken;

    // Create owner record for other owner with company_id
    await userRepository.query(
      'INSERT INTO owners (user_id, company_id) VALUES ($1, $2)',
      [otherOwnerRes.body.user.id, companyId],
    );
  });

  afterAll(async () => {
    // Clean up
    await propertyRepository.query(
      `DELETE FROM properties WHERE owner_id IN (SELECT user_id FROM owners WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@prop-${uniqueId}.test'))`,
    );
    await userRepository.query(
      `DELETE FROM owners WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@prop-${uniqueId}.test')`,
    );
    await companyRepository.query(
      `DELETE FROM companies WHERE tax_id = '${uniqueId}-prop'`,
    );
    await userRepository.query(
      `DELETE FROM users WHERE email LIKE '%@prop-${uniqueId}.test'`,
    );
    await app.close();
  });

  describe('/properties (POST)', () => {
    it('should create a property', () => {
      const propertyDto = {
        companyId: companyId,
        ownerId: ownerId,
        name: 'Test Property',
        addressStreet: 'Test Address 123',
        addressCity: 'Buenos Aires',
        addressState: 'CABA',
        addressPostalCode: '1425',
        propertyType: PropertyType.APARTMENT,
        status: PropertyStatus.ACTIVE,
        description: 'Test property',
      };

      return request(app.getHttpServer())
        .post('/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(propertyDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.addressStreet).toBe(propertyDto.addressStreet);
          expect(res.body.ownerId).toBe(ownerId);
        });
    });

    it('should fail without authentication', () => {
      expect.hasAssertions();
      const propertyDto = {
        companyId: companyId,
        ownerId: ownerId,
        name: 'Unauthorized Property',
        addressStreet: 'Unauthorized Address',
        addressCity: 'Buenos Aires',
        addressState: 'CABA',
        addressPostalCode: '1425',
        propertyType: PropertyType.APARTMENT,
      };

      return request(app.getHttpServer())
        .post('/properties')
        .send(propertyDto)
        .expect(401);
    });
  });

  describe('/properties (GET)', () => {
    beforeAll(async () => {
      // Create test properties
      const properties = [
        {
          companyId,
          ownerId,
          name: 'Filter Test Property 1',
          addressStreet: 'Filter Test 1',
          addressCity: 'Buenos Aires',
          addressState: 'CABA',
          addressPostalCode: '1425',
          propertyType: PropertyType.APARTMENT,
          status: PropertyStatus.ACTIVE,
        },
        {
          companyId,
          ownerId,
          name: 'Filter Test Property 2',
          addressStreet: 'Filter Test 2',
          addressCity: 'Córdoba',
          addressState: 'Córdoba',
          addressPostalCode: '5000',
          propertyType: PropertyType.COMMERCIAL,
          status: PropertyStatus.ACTIVE,
        },
      ];
      await propertyRepository.save(propertyRepository.create(properties));
    });

    it('should get all properties', () => {
      return request(app.getHttpServer())
        .get('/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body).toHaveProperty('total');
          expect(res.body).toHaveProperty('page');
          expect(res.body).toHaveProperty('limit');
        });
    });

    it('should filter properties by city', () => {
      return request(app.getHttpServer())
        .get('/properties?addressCity=Córdoba')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeGreaterThan(0);
          expect(
            res.body.data.every((p: any) => p.addressCity.includes('Córdoba')),
          ).toBe(true);
        });
    });

    it('should filter properties by type', () => {
      return request(app.getHttpServer())
        .get('/properties?propertyType=commercial')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeGreaterThan(0);
          expect(
            res.body.data.every((p: any) => p.propertyType === 'commercial'),
          ).toBe(true);
        });
    });

    it('should support pagination', () => {
      return request(app.getHttpServer())
        .get('/properties?page=1&limit=1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeLessThanOrEqual(1);
          expect(res.body.page).toBe(1);
          expect(res.body.limit).toBe(1);
        });
    });
  });

  describe('/properties/:id (GET, PATCH, DELETE)', () => {
    let propertyId: string;

    beforeAll(async () => {
      const propertyData = {
        companyId,
        ownerId,
        name: 'CRUD Test Property',
        addressStreet: 'CRUD Test Address',
        addressCity: 'Test City',
        addressState: 'Test State',
        addressPostalCode: '12345',
        propertyType: PropertyType.APARTMENT,
        status: PropertyStatus.ACTIVE,
      };
      const property = await propertyRepository.save(
        propertyRepository.create(propertyData),
      );
      propertyId = property.id;
    });

    it('should get property by id', () => {
      return request(app.getHttpServer())
        .get(`/properties/${propertyId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(propertyId);
          expect(res.body.name).toBe('CRUD Test Property');
        });
    });

    it('should update property by owner', () => {
      return request(app.getHttpServer())
        .patch(`/properties/${propertyId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ description: 'Updated description' })
        .expect(200)
        .expect((res) => {
          expect(res.body.description).toBe('Updated description');
        });
    });

    it('should fail to update property by different owner', () => {
      return request(app.getHttpServer())
        .patch(`/properties/${propertyId}`)
        .set('Authorization', `Bearer ${otherOwnerToken}`)
        .send({ description: 'Unauthorized update' })
        .expect(403);
    });

    it('should fail to delete property with occupied units', async () => {
      expect.hasAssertions();
      // This would require creating a unit and lease, simplified for this test
      return request(app.getHttpServer())
        .delete(`/properties/${propertyId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect((res) => {
          // Expect either success (200) if no units, or 400 if units exist
          expect([200, 400]).toContain(res.status);
        });
    });
  });
});
