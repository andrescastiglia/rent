import { PartialType } from '@nestjs/mapped-types';
import { CreateTenantDto, createTenantZodSchema } from './create-tenant.dto';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  static readonly zodSchema = createTenantZodSchema
    .omit({ email: true, password: true })
    .partial()
    .strict();

  // Cannot update email or password via this DTO
  email?: never;
  password?: never;
}
