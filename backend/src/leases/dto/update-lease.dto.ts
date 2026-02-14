import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaseDto } from './create-lease.dto'; // NOSONAR
import { createLeaseZodSchema } from './create-lease.dto'; // NOSONAR

export class UpdateLeaseDto extends PartialType(CreateLeaseDto) {
  static readonly zodSchema = createLeaseZodSchema.partial().strict();
}
