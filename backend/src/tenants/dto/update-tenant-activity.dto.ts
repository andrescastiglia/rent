import { PartialType } from '@nestjs/mapped-types';
import { CreateTenantActivityDto } from './create-tenant-activity.dto';

export class UpdateTenantActivityDto extends PartialType(
  CreateTenantActivityDto,
) {}
