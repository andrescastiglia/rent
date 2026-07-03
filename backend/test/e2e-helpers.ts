import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Repository } from 'typeorm';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { Company, PlanType } from '../src/companies/entities/company.entity';
import { Admin } from '../src/users/entities/admin.entity';
import { User, UserRole } from '../src/users/entities/user.entity';
import { UsersService } from '../src/users/users.service';

export function configureE2eApp(app: INestApplication) {
  app.useGlobalPipes(
    new ZodValidationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

export async function createTestCompany(
  companyRepository: Repository<Company>,
  values: Pick<Company, 'name' | 'taxId'> & Partial<Company>,
) {
  return companyRepository.save(
    companyRepository.create({
      plan: PlanType.BASIC,
      ...values,
    }),
  );
}

export async function createActiveTestUser(
  usersService: UsersService,
  values: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    companyId: string;
  },
): Promise<User> {
  return usersService.create({
    ...values,
    isActive: true,
  });
}

export async function createSuperAdminTestUser(
  usersService: UsersService,
  adminRepository: Repository<Admin>,
  values: Omit<Parameters<typeof createActiveTestUser>[1], 'role'>,
): Promise<User> {
  const user = await createActiveTestUser(usersService, {
    ...values,
    role: UserRole.ADMIN,
  });
  await adminRepository.save(
    adminRepository.create({
      userId: user.id,
      companyId: values.companyId,
      isSuperAdmin: true,
      permissions: {},
    }),
  );
  return user;
}

export async function loginTestUser(
  app: INestApplication,
  email: string,
  password: string,
) {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return response.body.accessToken as string;
}
