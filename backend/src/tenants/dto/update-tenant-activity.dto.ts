import { PartialType } from '@nestjs/mapped-types';
import {
  CreateTenantActivityDto,
  createTenantActivityZodSchema,
} from './create-tenant-activity.dto';

export class UpdateTenantActivityDto extends PartialType(
  CreateTenantActivityDto,
) {
  static readonly zodSchema = createTenantActivityZodSchema.partial().strict();
}
