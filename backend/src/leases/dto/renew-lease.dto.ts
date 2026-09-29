import { OmitType } from '@nestjs/swagger';
import { UpdateLeaseDto } from './update-lease.dto';

export class RenewLeaseDto extends OmitType(UpdateLeaseDto, [
  'companyId',
  'propertyId',
  'ownerId',
  'tenantId',
  'buyerId',
  'buyerProfileId',
  'contractType',
] as const) {
  static readonly zodSchema = UpdateLeaseDto.zodSchema.omit({
    companyId: true,
    propertyId: true,
    ownerId: true,
    tenantId: true,
    buyerId: true,
    buyerProfileId: true,
    contractType: true,
  });
}
