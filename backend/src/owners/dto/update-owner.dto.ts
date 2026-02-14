import { PartialType } from '@nestjs/mapped-types';
import { CreateOwnerDto } from './create-owner.dto'; // NOSONAR
import { createOwnerZodSchema } from './create-owner.dto'; // NOSONAR

export class UpdateOwnerDto extends PartialType(CreateOwnerDto) {
  static readonly zodSchema = createOwnerZodSchema.partial().strict();
}
