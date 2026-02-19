import { DataSource, QueryRunner } from 'typeorm';
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
import { join } from 'node:path';

// Load env vars from root .env
dotenv.config({ path: join(__dirname, '../../../.env') });

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'rent_user',
  password: process.env.POSTGRES_PASSWORD || 'rent_password',
  database: process.env.POSTGRES_DB || 'rent_db',
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

type SeedUserInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
};

async function ensureCurrency(
  queryRunner: QueryRunner,
  currencyData: {
    code: string;
    symbol: string;
    decimalPlaces: number;
    isActive: boolean;
  },
): Promise<void> {
  const existing = await queryRunner.manager.findOne(Currency, {
    where: { code: currencyData.code },
  });
  if (existing) {
    console.log(`Currency ${currencyData.code} already exists`);
    return;
  }

  const currency = queryRunner.manager.create(Currency, currencyData);
  await queryRunner.manager.save(currency);
  console.log(`Currency ${currencyData.code} created`);
}

async function ensureUser(
  queryRunner: QueryRunner,
  input: SeedUserInput,
): Promise<User> {
  const existingUser = await findUserByEmail(queryRunner, input.email);
  if (existingUser) {
    console.log(`${input.role} user already exists`);
    return existingUser;
  }

  const saved = await createSeedUser(queryRunner, input);
  console.log(`${input.role} user created`);
  return saved;
}

async function findUserByEmail(
  queryRunner: QueryRunner,
  email: string,
): Promise<User | null> {
  return queryRunner.manager.findOne(User, {
    where: { email },
  });
}

async function createSeedUser(
  queryRunner: QueryRunner,
  input: SeedUserInput,
): Promise<User> {
  const salt = await bcrypt.genSalt();
  const passwordHash = await bcrypt.hash(input.password, salt);

  const user = queryRunner.manager.create(User, {
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    isActive: true,
    isEmailVerified: true,
    phone: input.phone,
  });

  return queryRunner.manager.save(user);
}

async function ensureCompany(queryRunner: QueryRunner): Promise<Company> {
  const existingCompany = await queryRunner.manager.findOne(Company, {
    where: { taxId: '20-12345678-9' },
  });
  if (existingCompany) {
    return existingCompany;
  }

  const company = queryRunner.manager.create(Company, {
    name: 'My Rental Company',
    taxId: '20-12345678-9',
    plan: PlanType.BASIC,
    isActive: true,
  });
  const saved = await queryRunner.manager.save(company);
  console.log('Company created');
  return saved;
}

async function ensureOwnerRecord(
  queryRunner: QueryRunner,
  ownerUser: User,
  company: Company,
): Promise<Owner> {
  const existingOwner = await queryRunner.manager.findOne(Owner, {
    where: { userId: ownerUser.id },
  });
  if (existingOwner) {
    return existingOwner;
  }

  const owner = queryRunner.manager.create(Owner, {
    user: ownerUser,
    company,
    taxId: '20-12345678-9',
    taxIdType: 'CUIT',
  });
  const saved = await queryRunner.manager.save(owner);
  console.log('Owner record created');
  return saved;
}

async function ensureProperty(
  queryRunner: QueryRunner,
  company: Company,
  owner: Owner,
): Promise<Property> {
  const existingProperty = await queryRunner.manager.findOne(Property, {
    where: { name: 'Edificio Libertador' },
  });
  if (existingProperty) {
    return existingProperty;
  }

  const property = queryRunner.manager.create(Property, {
    company,
    owner,
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
  const saved = await queryRunner.manager.save(property);
  console.log('Property created');
  return saved;
}

async function ensureUnit(
  queryRunner: QueryRunner,
  company: Company,
  property: Property,
): Promise<void> {
  const existingUnit = await queryRunner.manager.findOne(Unit, {
    where: { property: { id: property.id }, unitNumber: '101' },
  });
  if (existingUnit) {
    return;
  }

  const unit = queryRunner.manager.create(Unit, {
    property,
    company,
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

async function ensureTenantRecord(
  queryRunner: QueryRunner,
  tenantUser: User,
  company: Company,
): Promise<Tenant> {
  const existingTenant = await queryRunner.manager.findOne(Tenant, {
    where: { userId: tenantUser.id },
  });
  if (existingTenant) {
    return existingTenant;
  }

  const tenant = queryRunner.manager.create(Tenant, {
    user: tenantUser,
    company,
    dni: '30123456',
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '+5491187654321',
  });
  const saved = await queryRunner.manager.save(tenant);
  console.log('Tenant record created');
  return saved;
}

async function ensureLease(
  queryRunner: QueryRunner,
  company: Company,
  property: Property,
  owner: Owner,
  tenant: Tenant,
): Promise<void> {
  const existingLease = await queryRunner.manager.findOne(Lease, {
    where: { propertyId: property.id, tenantId: tenant.id },
  });
  if (existingLease) {
    console.log('Lease already exists');
    return;
  }

  const lease = queryRunner.manager.create(Lease, {
    company,
    property,
    tenant,
    owner,
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
}

async function runSeedTransaction(queryRunner: QueryRunner): Promise<void> {
  console.log('Seeding data...');

  const currencies = [
    { code: 'ARS', symbol: '$', decimalPlaces: 2, isActive: true },
    { code: 'BRL', symbol: 'R$', decimalPlaces: 2, isActive: true },
    { code: 'USD', symbol: 'US$', decimalPlaces: 2, isActive: true },
  ];
  for (const currencyData of currencies) {
    await ensureCurrency(queryRunner, currencyData);
  }

  await ensureUser(queryRunner, {
    email: 'admin@example.com',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
  });

  const ownerUser = await ensureUser(queryRunner, {
    email: 'owner@example.com',
    password: 'owner123',
    firstName: 'John',
    lastName: 'Owner',
    role: UserRole.OWNER,
  });

  const company = await ensureCompany(queryRunner);
  const owner = await ensureOwnerRecord(queryRunner, ownerUser, company);
  const property = await ensureProperty(queryRunner, company, owner);
  await ensureUnit(queryRunner, company, property);

  const tenantUser = await ensureUser(queryRunner, {
    email: 'tenant@example.com',
    password: 'tenant123',
    firstName: 'Maria',
    lastName: 'Tenant',
    role: UserRole.TENANT,
    phone: '+5491112345678',
  });

  const tenant = await ensureTenantRecord(queryRunner, tenantUser, company);
  await ensureLease(queryRunner, company, property, owner, tenant);
}

async function runSeedInTransaction(): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    await runSeedTransaction(queryRunner);
    await queryRunner.commitTransaction();
    console.log('Seeding completed successfully');
  } catch (err) {
    console.error('Error during seeding:', err);
    await queryRunner.rollbackTransaction();
  } finally {
    await queryRunner.release();
  }
}

async function seed() {
  try {
    console.log('Connecting to database...');
    await AppDataSource.initialize();
    console.log('Connected!');
    await runSeedInTransaction();
  } catch (error) {
    console.error('Error connecting to database:', error);
  } finally {
    await AppDataSource.destroy();
  }
}

void seed();
