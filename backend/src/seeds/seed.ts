import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import { Company, PlanType } from '../companies/entities/company.entity';
import { Property, PropertyType, PropertyStatus } from '../properties/entities/property.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { Lease, LeaseStatus, PaymentFrequency } from '../leases/entities/lease.entity';
import { PropertyFeature } from '../properties/entities/property-feature.entity';
import { join } from 'path';

// Load env vars from root .env
dotenv.config({ path: join(__dirname, '../../../.env') });

const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'rent_user',
    password: process.env.POSTGRES_PASSWORD || 'rent_dev_password',
    database: process.env.POSTGRES_DB || 'rent_dev',
    entities: [
        User,
        Company,
        Property,
        Unit,
        Lease,
        PropertyFeature,
        // Add other entities if needed
    ],
    synchronize: false,
    logging: true,
});

async function seed() {
    try {
        console.log('Connecting to database...');
        await AppDataSource.initialize();
        console.log('Connected!');

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            console.log('Seeding data...');

            // 1. Create Admin User
            const adminEmail = 'admin@example.com';
            let admin = await queryRunner.manager.findOne(User, { where: { email: adminEmail } });
            if (!admin) {
                const salt = await bcrypt.genSalt();
                const passwordHash = await bcrypt.hash('admin123', salt);
                admin = queryRunner.manager.create(User, {
                    email: adminEmail,
                    passwordHash,
                    firstName: 'Admin',
                    lastName: 'User',
                    role: UserRole.ADMIN,
                    isActive: true,
                    isEmailVerified: true,
                });
                await queryRunner.manager.save(admin);
                console.log('Admin user created');
            } else {
                console.log('Admin user already exists');
            }

            // 2. Create Owner User
            const ownerEmail = 'owner@example.com';
            let owner = await queryRunner.manager.findOne(User, { where: { email: ownerEmail } });
            if (!owner) {
                const salt = await bcrypt.genSalt();
                const passwordHash = await bcrypt.hash('owner123', salt);
                owner = queryRunner.manager.create(User, {
                    email: ownerEmail,
                    passwordHash,
                    firstName: 'John',
                    lastName: 'Owner',
                    role: UserRole.OWNER,
                    isActive: true,
                    isEmailVerified: true,
                });
                await queryRunner.manager.save(owner);
                console.log('Owner user created');
            } else {
                console.log('Owner user already exists');
            }

            // 3. Create Company for Owner
            let company = await queryRunner.manager.findOne(Company, { where: { taxId: '20-12345678-9' } });
            if (!company) {
                company = queryRunner.manager.create(Company, {
                    name: 'My Rental Company',
                    taxId: '20-12345678-9',
                    planType: PlanType.BASIC,
                    isActive: true,
                });
                await queryRunner.manager.save(company);
                console.log('Company created');
            }

            // 4. Create Property
            let property = await queryRunner.manager.findOne(Property, { where: { address: 'Av. Libertador 1234' } });
            if (!property) {
                property = queryRunner.manager.create(Property, {
                    company: company,
                    owner: owner,
                    address: 'Av. Libertador 1234',
                    city: 'Buenos Aires',
                    state: 'CABA',
                    zipCode: '1425',
                    country: 'Argentina',
                    type: PropertyType.RESIDENTIAL,
                    status: PropertyStatus.ACTIVE,
                    description: 'Luxury apartment building',
                    yearBuilt: 2015,
                });
                await queryRunner.manager.save(property);
                console.log('Property created');
            }

            // 5. Create Unit
            let unit = await queryRunner.manager.findOne(Unit, { where: { property: { id: property.id }, unitNumber: '101' } });
            if (!unit) {
                unit = queryRunner.manager.create(Unit, {
                    property: property,
                    unitNumber: '101',
                    floor: 1,
                    bedrooms: 2,
                    bathrooms: 1,
                    areaSqm: 65.5,
                    monthlyRent: 1500,
                    status: UnitStatus.AVAILABLE,
                    hasParking: true,
                    parkingSpots: 1,
                });
                await queryRunner.manager.save(unit);
                console.log('Unit created');
            }

            // 6. Create Tenant User
            const tenantEmail = 'tenant@example.com';
            let tenantUser = await queryRunner.manager.findOne(User, { where: { email: tenantEmail } });
            if (!tenantUser) {
                const salt = await bcrypt.genSalt();
                const passwordHash = await bcrypt.hash('tenant123', salt);
                tenantUser = queryRunner.manager.create(User, {
                    email: tenantEmail,
                    passwordHash,
                    firstName: 'Maria',
                    lastName: 'Tenant',
                    role: UserRole.TENANT,
                    isActive: true,
                    isEmailVerified: true,
                    phone: '+5491112345678',
                });
                await queryRunner.manager.save(tenantUser);
                console.log('Tenant user created');

                // 7. Create Tenant Record (Raw SQL)
                // Check if tenant record exists
                const existingTenantRecord = await queryRunner.query(
                    `SELECT * FROM tenants WHERE user_id = $1`,
                    [tenantUser.id]
                );

                if (existingTenantRecord.length === 0) {
                    await queryRunner.query(
                        `INSERT INTO tenants (user_id, dni, emergency_contact, emergency_phone) VALUES ($1, $2, $3, $4)`,
                        [tenantUser.id, '30123456', 'Emergency Contact', '+5491187654321']
                    );
                    console.log('Tenant record created');
                }
            } else {
                console.log('Tenant user already exists');
            }

            // 8. Create Lease
            // We need to fetch the tenantUser again to be sure we have the ID if it already existed
            tenantUser = await queryRunner.manager.findOne(User, { where: { email: tenantEmail } });

            // Check if lease exists for this unit and tenant
            // Note: In a real scenario, we might have multiple leases. Here we check if ANY lease exists for this pair to avoid dupes in seed.
            const existingLease = await queryRunner.manager.findOne(Lease, {
                where: { unit: { id: unit.id }, tenant: { id: tenantUser!.id } }
            });

            if (!existingLease) {
                const lease = queryRunner.manager.create(Lease, {
                    unit: unit,
                    tenant: tenantUser!,
                    startDate: new Date('2024-01-01'),
                    endDate: new Date('2024-12-31'),
                    rentAmount: 1500,
                    deposit: 3000,
                    status: LeaseStatus.ACTIVE,
                    paymentFrequency: PaymentFrequency.MONTHLY,
                });
                await queryRunner.manager.save(lease);
                console.log('Lease created');

                // Update unit status to OCCUPIED
                unit.status = UnitStatus.OCCUPIED;
                await queryRunner.manager.save(unit);
            } else {
                console.log('Lease already exists');
            }

            await queryRunner.commitTransaction();
            console.log('Seeding completed successfully');
        } catch (err) {
            console.error('Error during seeding:', err);
            await queryRunner.rollbackTransaction();
        } finally {
            await queryRunner.release();
        }

    } catch (error) {
        console.error('Error connecting to database:', error);
    } finally {
        await AppDataSource.destroy();
    }
}

seed();
