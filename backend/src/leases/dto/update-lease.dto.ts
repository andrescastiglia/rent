import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaseDto } from './create-lease.dto';

export class UpdateLeaseDto extends PartialType(CreateLeaseDto) {
  // Cannot update unitId or tenantId via this DTO
  unitId?: never;
  tenantId?: never;
}
