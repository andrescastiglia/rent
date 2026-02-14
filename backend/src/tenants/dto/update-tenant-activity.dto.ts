import { PartialType } from '@nestjs/mapped-types';
import { CreateTenantActivityDto } from './create-tenant-activity.dto'; // NOSONAR
import { createTenantActivityZodSchema } from './create-tenant-activity.dto'; // NOSONAR

export class UpdateTenantActivityDto extends PartialType(
  CreateTenantActivityDto,
) {
  static readonly zodSchema = createTenantActivityZodSchema.partial().strict();
}
