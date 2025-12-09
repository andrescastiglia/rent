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
import { Unit, UnitStatus } from '../src/properties/entities/unit.entity';
import { Lease } from '../src/leases/entities/lease.entity';
import { Company, PlanType } from '../src/companies/entities/company.entity';
import { Repository } from 'typeorm';

describe('Lease Creation Flow (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let propertyRepository: Repository<Property>;
  let unitRepository: Repository<Unit>;
  let leaseRepository: Repository<Lease>;
  let companyRepository: Repository<Company>;
  let ownerToken: string;
  let ownerId: string;
  let companyId: string;
  let uniqueId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );

    userRepository = moduleFixture.get(getRepositoryToken(User));
    propertyRepository = moduleFixture.get(getRepositoryToken(Property));
    unitRepository = moduleFixture.get(getRepositoryToken(Unit));
    leaseRepository = moduleFixture.get(getRepositoryToken(Lease));
    companyRepository = moduleFixture.get(getRepositoryToken(Company));

    await app.init();

    // Generate unique identifier for this test run
    uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Clean up any existing test data first (respecting foreign keys)
    try {
      await userRepository.query(
        `DELETE FROM tenants WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@lease-${uniqueId}.test')`,
      );
      await leaseRepository.query(
        "DELETE FROM leases WHERE unit_id IN (SELECT id FROM units WHERE property_id IN (SELECT id FROM properties WHERE company_id IN (SELECT id FROM companies WHERE tax_id LIKE '%-lease')))",
      );
      await unitRepository.query(
        "DELETE FROM units WHERE property_id IN (SELECT id FROM properties WHERE company_id IN (SELECT id FROM companies WHERE tax_id LIKE '%-lease'))",
      );
      await propertyRepository.query(
        "DELETE FROM properties WHERE company_id IN (SELECT id FROM companies WHERE tax_id LIKE '%-lease')",
      );
      await userRepository.query(
        `DELETE FROM owners WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@lease-${uniqueId}.test')`,
      );
      await userRepository.query(
        `DELETE FROM users WHERE email LIKE '%@lease-${uniqueId}.test'`,
      );
      await companyRepository.query(
        "DELETE FROM companies WHERE tax_id LIKE '%-lease'",
      );
    } catch {
      // Ignore cleanup errors
    }

    // Create owner user and company for tests
    const ownerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `owner-flow-${uniqueId}@lease-${uniqueId}.test`,
        password: 'Password123!',
        firstName: 'Flow',
        lastName: 'Owner',
        role: 'owner',
      });

    ownerToken = ownerRes.body.access_token;
    const ownerUserId = ownerRes.body.user.id;

    // Create company first (needed for owners)
    const company = companyRepository.create({
      name: 'Lease Flow Test Company',
      taxId: `${uniqueId}-lease`,
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
  });

  afterAll(async () => {
    // Clean up test data in correct order (respecting foreign keys)
    // 1. Delete leases first (depends on units and tenants)
    await leaseRepository.query(
      `DELETE FROM leases WHERE tenant_id IN (SELECT id FROM users WHERE email LIKE '%@lease-${uniqueId}.test')`,
    );
    // 2. Delete units (depends on properties) - match by company_id since properties use our test companyId
    await unitRepository.query(
      "DELETE FROM units WHERE property_id IN (SELECT id FROM properties WHERE company_id IN (SELECT id FROM companies WHERE tax_id LIKE '%-lease'))",
    );
    // 3. Delete properties (depends on companies and owners) - match by company_id
    await propertyRepository.query(
      "DELETE FROM properties WHERE company_id IN (SELECT id FROM companies WHERE tax_id LIKE '%-lease')",
    );
    // 4. Delete companies (now safe, no FK dependencies)
    await companyRepository.query(
      "DELETE FROM companies WHERE tax_id LIKE '%-lease'",
    );
    // 5. Delete tenants (depends on users)
    await userRepository.query(
      `DELETE FROM tenants WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@lease-${uniqueId}.test')`,
    );
    // 6. Delete owners (depends on users)
    await userRepository.query(
      `DELETE FROM owners WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@lease-${uniqueId}.test')`,
    );
    // 7. Finally delete users
    await userRepository.query(
      `DELETE FROM users WHERE email LIKE '%@lease-${uniqueId}.test'`,
    );

    await app.close();
  });

  describe('Complete Lease Creation Workflow', () => {
    let propertyId: string;
    let unitId: string;
    let tenantId: string;
    let leaseId: string;

    it('Step 1: Should create a property', async () => {
      const propertyDto = {
        companyId: companyId,
        ownerId: ownerId,
        name: 'Flow Test Property',
        addressStreet: '123 Flow Test Street',
        addressCity: 'Test City',
        addressState: 'Test State',
        addressPostalCode: '12345',
        addressCountry: 'Argentina',
        propertyType: PropertyType.APARTMENT,
        status: PropertyStatus.ACTIVE,
        description: 'Test property for flow',
      };

      const res = await request(app.getHttpServer())
        .post('/properties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(propertyDto)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.addressStreet).toBe(propertyDto.addressStreet);
      propertyId = res.body.id;
    });

    it('Step 2: Should create a unit in the property', async () => {
      const unitDto = {
        propertyId: propertyId,
        companyId: companyId,
        unitNumber: '101',
        bedrooms: 2,
        bathrooms: 1,
        area: 65,
        baseRent: 1500,
        status: 'available',
      };

      const res = await request(app.getHttpServer())
        .post('/units')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(unitDto)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.unitNumber).toBe(unitDto.unitNumber);
      unitId = res.body.id;
    });

    it('Step 3: Should create a tenant', async () => {
      const shortId = uniqueId.slice(-8);
      const tenantDto = {
        companyId: companyId,
        email: `tenant-flow-${shortId}@lease-${shortId}.test`,
        password: 'Password123!',
        firstName: 'Flow',
        lastName: 'Tenant',
        phone: '+5491112345678',
        dni: `DNI${shortId}`,
        emergencyContact: 'Emergency Contact',
        emergencyPhone: '+5491187654321',
      };

      const res = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(tenantDto)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe(tenantDto.email);

      // Get the tenant record ID (not the user ID)
      const tenantRecord = await userRepository.query(
        'SELECT id FROM tenants WHERE user_id = $1',
        [res.body.id],
      );
      tenantId = tenantRecord[0].id;
    });

    it('Step 4: Should create a lease in draft status', async () => {
      const leaseDto = {
        companyId: companyId,
        unitId: unitId,
        tenantId: tenantId,
        ownerId: ownerId,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        monthlyRent: 1500,
        securityDeposit: 3000,
        paymentFrequency: 'monthly',
      };

      const res = await request(app.getHttpServer())
        .post('/leases')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(leaseDto);

      console.log('Lease creation response:', res.status, res.body);
      expect(res.status).toBe(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('draft');
      expect(res.body.unitId).toBe(unitId);
      expect(res.body.tenantId).toBe(tenantId);
      leaseId = res.body.id;
    });

    it('Step 5: Should activate the lease', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/leases/${leaseId}/activate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.status).toBe('active');
    });

    it('Step 6: Should verify unit is now occupied', async () => {
      const res = await request(app.getHttpServer())
        .get(`/units/${unitId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.status).toBe('occupied');
    });

    it('Step 7: Should retrieve lease with all relationships', async () => {
      const res = await request(app.getHttpServer())
        .get(`/leases/${leaseId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('unit');
      expect(res.body).toHaveProperty('tenant');
      expect(res.body.unit).toHaveProperty('property');
      expect(res.body.unit.property.id).toBe(propertyId);
    });

    it('Step 8: Should prevent creating another active lease for same unit', async () => {
      const leaseDto = {
        companyId: companyId,
        unitId: unitId,
        tenantId: tenantId,
        ownerId: ownerId,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        monthlyRent: 1600,
        securityDeposit: 3200,
        paymentFrequency: 'monthly',
      };

      const createRes = await request(app.getHttpServer())
        .post('/leases')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(leaseDto)
        .expect(201);

      // Attempt to activate should fail
      await request(app.getHttpServer())
        .patch(`/leases/${createRes.body.id}/activate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409); // Conflict
    });
  });

  describe('Lease Termination Flow', () => {
    let propertyId: string;
    let unitId: string;
    let tenantId: string;
    let leaseId: string;

    beforeAll(async () => {
      // Create property, unit, tenant, and active lease
      const propertyData = {
        companyId: companyId,
        ownerId: ownerId,
        name: 'Lease Termination Test Property',
        addressStreet: 'Lease Test Address',
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

      const unitData = {
        propertyId: propertyId,
        companyId: companyId,
        unitNumber: '201',
        bedrooms: 1,
        bathrooms: 1,
        area: 50,
        baseRent: 1200,
        status: UnitStatus.AVAILABLE,
      };
      const unit = await unitRepository.save(unitRepository.create(unitData));
      unitId = unit.id;

      const shortTermId = uniqueId.slice(-8);
      const tenantRes = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          companyId: companyId,
          email: `term-${shortTermId}@lease-${uniqueId}.test`,
          password: 'Password123!',
          firstName: 'Term',
          lastName: 'Tenant',
          phone: '+123',
          dni: `TRM${shortTermId}`,
        });

      // Get the tenant record ID (not the user ID)
      const tenantRecord = await userRepository.query(
        'SELECT id FROM tenants WHERE user_id = $1',
        [tenantRes.body.id],
      );
      tenantId = tenantRecord[0].id;

      const leaseRes = await request(app.getHttpServer())
        .post('/leases')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          companyId: companyId,
          unitId: unitId,
          tenantId: tenantId,
          ownerId: ownerId,
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          monthlyRent: 1200,
          securityDeposit: 2400,
        });
      leaseId = leaseRes.body.id;

      await request(app.getHttpServer())
        .patch(`/leases/${leaseId}/activate`)
        .set('Authorization', `Bearer ${ownerToken}`);
    });

    it('Should terminate active lease', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/leases/${leaseId}/terminate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Early termination by tenant' })
        .expect(200);

      expect(res.body.status).toBe('terminated');
    });

    it('Should mark unit as available after termination', async () => {
      const res = await request(app.getHttpServer())
        .get(`/units/${unitId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.status).toBe('available');
    });
  });
});
