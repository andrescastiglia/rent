import { PartialType } from '@nestjs/mapped-types';
import { CreateTenantDto, createTenantZodSchema } from './create-tenant.dto';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  static readonly zodSchema = createTenantZodSchema
    .omit({ password: true })
    .partial()
    .strict();

  // Password changes remain in the authenticated access workflow.
  password?: never;
}
