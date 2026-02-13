import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaseDto, createLeaseZodSchema } from './create-lease.dto';

export class RenewLeaseDto extends PartialType(CreateLeaseDto) {
  static readonly zodSchema = createLeaseZodSchema.partial().strict();
}
