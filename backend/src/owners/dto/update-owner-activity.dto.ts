import { PartialType } from '@nestjs/mapped-types';
import { CreateOwnerActivityDto } from './create-owner-activity.dto'; // NOSONAR
import { createOwnerActivityZodSchema } from './create-owner-activity.dto'; // NOSONAR

export class UpdateOwnerActivityDto extends PartialType(
  CreateOwnerActivityDto,
) {
  static readonly zodSchema = createOwnerActivityZodSchema.partial().strict();
}
