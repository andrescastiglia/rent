import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/users/entities/user.entity';
import { Property } from '../src/properties/entities/property.entity';
import { Unit } from '../src/properties/entities/unit.entity';
import { Lease } from '../src/leases/entities/lease.entity';
import { Company } from '../src/companies/entities/company.entity';
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

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

        userRepository = moduleFixture.get(getRepositoryToken(User));
        propertyRepository = moduleFixture.get(getRepositoryToken(Property));
        unitRepository = moduleFixture.get(getRepositoryToken(Unit));
        leaseRepository = moduleFixture.get(getRepositoryToken(Lease));
        companyRepository = moduleFixture.get(getRepositoryToken(Company));

        await app.init();

        // Create owner user and company for tests
        const ownerRes = await request(app.getHttpServer())
            .post('/auth/register')
            .send({
                email: 'owner-flow@test-e2e.com',
                password: 'Password123!',
                firstName: 'Flow',
                lastName: 'Owner',
                role: 'owner',
            });

        ownerToken = ownerRes.body.access_token;
        ownerId = ownerRes.body.user.id;

        // Create company
        const company = companyRepository.create({
            name: 'Test Flow Company',
            taxId: '12345678-flow',
            planType: 'basic',
        });
        const savedCompany = await companyRepository.save(company);
        companyId = savedCompany.id;
    });

    afterAll(async () => {
        // Clean up test data
        await leaseRepository.query('DELETE FROM leases WHERE tenant_id IN (SELECT id FROM users WHERE email LIKE \'%@test-e2e.com\')');
        await userRepository.query('DELETE FROM tenants WHERE user_id IN (SELECT id FROM users WHERE email LIKE \'%@test-e2e.com\')');
        await unitRepository.query('DELETE FROM units WHERE property_id IN (SELECT id FROM properties WHERE address LIKE \'%Flow Test%\')');
        await propertyRepository.query('DELETE FROM properties WHERE address LIKE \'%Flow Test%\'');
        await companyRepository.query('DELETE FROM companies WHERE tax_id LIKE \'%-flow\'');
        await userRepository.query('DELETE FROM users WHERE email LIKE \'%@test-e2e.com\'');

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
                address: '123 Flow Test Street',
                city: 'Test City',
                state: 'Test State',
                zipCode: '12345',
                country: 'Argentina',
                type: 'residential',
                status: 'active',
                description: 'Test property for flow',
            };

            const res = await request(app.getHttpServer())
                .post('/properties')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(propertyDto)
                .expect(201);

            expect(res.body).toHaveProperty('id');
            expect(res.body.address).toBe(propertyDto.address);
            propertyId = res.body.id;
        });

        it('Step 2: Should create a unit in the property', async () => {
            const unitDto = {
                propertyId: propertyId,
                unitNumber: '101',
                bedrooms: 2,
                bathrooms: 1,
                areaSqm: 65,
                monthlyRent: 1500,
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
            const tenantDto = {
                email: 'tenant-flow@test-e2e.com',
                password: 'Password123!',
                firstName: 'Flow',
                lastName: 'Tenant',
                phone: '+5491112345678',
                dni: '12345678-flow',
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
            tenantId = res.body.id;
        });

        it('Step 4: Should create a lease in draft status', async () => {
            const leaseDto = {
                unitId: unitId,
                tenantId: tenantId,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                rentAmount: 1500,
                deposit: 3000,
                paymentFrequency: 'monthly',
            };

            const res = await request(app.getHttpServer())
                .post('/leases')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send(leaseDto)
                .expect(201);

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
                unitId: unitId,
                tenantId: tenantId,
                startDate: '2025-01-01',
                endDate: '2025-12-31',
                rentAmount: 1600,
                deposit: 3200,
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
            const property = await propertyRepository.save(
                propertyRepository.create({
                    companyId: companyId,
                    ownerId: ownerId,
                    address: '456 Termination Test Street',
                    city: 'Test City',
                    state: 'Test State',
                    zipCode: '12345',
                    type: 'residential',
                    status: 'active',
                })
            );
            propertyId = property.id;

            const unit = await unitRepository.save(
                unitRepository.create({
                    propertyId: propertyId,
                    unitNumber: '201',
                    bedrooms: 1,
                    bathrooms: 1,
                    areaSqm: 50,
                    monthlyRent: 1200,
                    status: 'available',
                })
            );
            unitId = unit.id;

            const tenantRes = await request(app.getHttpServer())
                .post('/tenants')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({
                    email: 'termination-tenant@test-e2e.com',
                    password: 'Password123!',
                    firstName: 'Term',
                    lastName: 'Tenant',
                    phone: '+123',
                    dni: '99999999-flow',
                });
            tenantId = tenantRes.body.id;

            const leaseRes = await request(app.getHttpServer())
                .post('/leases')
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({
                    unitId: unitId,
                    tenantId: tenantId,
                    startDate: '2024-01-01',
                    endDate: '2024-12-31',
                    rentAmount: 1200,
                    deposit: 2400,
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
