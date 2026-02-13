import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaseDto } from './create-lease.dto';
import { createLeaseZodSchema } from './create-lease.dto';

export class UpdateLeaseDto extends PartialType(CreateLeaseDto) {
  static readonly zodSchema = createLeaseZodSchema.partial().strict();
}
