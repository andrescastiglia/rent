import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import { Admin } from '../users/entities/admin.entity';
import { Company, PlanType } from '../companies/entities/company.entity';
import {
  Property,
  PropertyOperationState,
  PropertyType,
  PropertyStatus,
} from '../properties/entities/property.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import {
  Lease,
  ContractType,
  LeaseStatus,
  PaymentFrequency,
} from '../leases/entities/lease.entity';
import { LeaseAmendment } from '../leases/entities/lease-amendment.entity';
import { PropertyFeature } from '../properties/entities/property-feature.entity';
import { Document } from '../documents/entities/document.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { Owner } from '../owners/entities/owner.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Staff } from '../staff/entities/staff.entity';
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
    Admin,
    Company,
    Property,
    Unit,
    Lease,
    LeaseAmendment,
    PropertyFeature,
    Document,
    Currency,
    Owner,
    Tenant,
    Staff,
  ],
  synchronize: false, // Don't sync - use the SQL schema
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

      // 0. Create Currencies
      const currencies = [
        { code: 'ARS', symbol: '$', decimalPlaces: 2, isActive: true },
        { code: 'BRL', symbol: 'R$', decimalPlaces: 2, isActive: true },
        { code: 'USD', symbol: 'US$', decimalPlaces: 2, isActive: true },
      ];

      for (const currencyData of currencies) {
        const existing = await queryRunner.manager.findOne(Currency, {
          where: { code: currencyData.code },
        });
        if (!existing) {
          const currency = queryRunner.manager.create(Currency, currencyData);
          await queryRunner.manager.save(currency);
          console.log(`Currency ${currencyData.code} created`);
        } else {
          console.log(`Currency ${currencyData.code} already exists`);
        }
      }

      // 1. Create Admin User
      const adminEmail = 'admin@example.com';
      let admin = await queryRunner.manager.findOne(User, {
        where: { email: adminEmail },
      });
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
      let ownerUser = await queryRunner.manager.findOne(User, {
        where: { email: ownerEmail },
      });
      if (!ownerUser) {
        const salt = await bcrypt.genSalt();
        const passwordHash = await bcrypt.hash('owner123', salt);
        ownerUser = queryRunner.manager.create(User, {
          email: ownerEmail,
          passwordHash,
          firstName: 'John',
          lastName: 'Owner',
          role: UserRole.OWNER,
          isActive: true,
          isEmailVerified: true,
        });
        await queryRunner.manager.save(ownerUser);
        console.log('Owner user created');
      } else {
        console.log('Owner user already exists');
      }

      // 3. Create Company for Owner
      let company = await queryRunner.manager.findOne(Company, {
        where: { taxId: '20-12345678-9' },
      });
      if (!company) {
        company = queryRunner.manager.create(Company, {
          name: 'My Rental Company',
          taxId: '20-12345678-9',
          plan: PlanType.BASIC,
          isActive: true,
        });
        await queryRunner.manager.save(company);
        console.log('Company created');
      }

      // 3b. Create Owner Record
      let owner = await queryRunner.manager.findOne(Owner, {
        where: { userId: ownerUser.id },
      });
      if (!owner) {
        owner = queryRunner.manager.create(Owner, {
          user: ownerUser,
          company: company,
          taxId: '20-12345678-9',
          taxIdType: 'CUIT',
        });
        await queryRunner.manager.save(owner);
        console.log('Owner record created');
      }

      // 4. Create Property
      let property = await queryRunner.manager.findOne(Property, {
        where: { name: 'Edificio Libertador' },
      });
      if (!property) {
        property = queryRunner.manager.create(Property, {
          company: company,
          owner: owner,
          name: 'Edificio Libertador',
          propertyType: PropertyType.APARTMENT,
          status: PropertyStatus.ACTIVE,
          addressStreet: 'Av. Libertador',
          addressNumber: '1234',
          addressCity: 'Buenos Aires',
          addressState: 'CABA',
          addressCountry: 'Argentina',
          addressPostalCode: '1425',
          description: 'Luxury apartment building',
          yearBuilt: 2015,
        });
        await queryRunner.manager.save(property);
        console.log('Property created');
      }

      // 5. Create Unit
      let unit = await queryRunner.manager.findOne(Unit, {
        where: { property: { id: property.id }, unitNumber: '101' },
      });
      if (!unit) {
        unit = queryRunner.manager.create(Unit, {
          property: property,
          company: company,
          unitNumber: '101',
          floor: '1',
          bedrooms: 2,
          bathrooms: 1,
          area: 65.5,
          baseRent: 1500,
          currency: 'USD',
          status: UnitStatus.AVAILABLE,
          hasParking: true,
          parkingSpots: 1,
        });
        await queryRunner.manager.save(unit);
        console.log('Unit created');
      }

      // 6. Create Tenant User
      const tenantEmail = 'tenant@example.com';
      let tenantUser = await queryRunner.manager.findOne(User, {
        where: { email: tenantEmail },
      });
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
      } else {
        console.log('Tenant user already exists');
      }

      // 7. Create Tenant Record
      let tenant = await queryRunner.manager.findOne(Tenant, {
        where: { userId: tenantUser.id },
      });
      if (!tenant) {
        tenant = queryRunner.manager.create(Tenant, {
          user: tenantUser,
          company: company,
          dni: '30123456',
          emergencyContactName: 'Emergency Contact',
          emergencyContactPhone: '+5491187654321',
        });
        await queryRunner.manager.save(tenant);
        console.log('Tenant record created');
      }

      // 8. Create Lease
      // Check if lease exists for this property and tenant
      const existingLease = await queryRunner.manager.findOne(Lease, {
        where: { propertyId: property.id, tenantId: tenant.id },
      });

      if (!existingLease) {
        const lease = queryRunner.manager.create(Lease, {
          company: company,
          property: property,
          tenant: tenant,
          owner: owner,
          contractType: ContractType.RENTAL,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
          monthlyRent: 1500,
          currency: 'USD',
          securityDeposit: 3000,
          status: LeaseStatus.ACTIVE,
          paymentFrequency: PaymentFrequency.MONTHLY,
        });
        await queryRunner.manager.save(lease);
        console.log('Lease created');

        property.operationState = PropertyOperationState.RENTED;
        await queryRunner.manager.save(property);
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
