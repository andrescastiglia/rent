import { PartialType } from '@nestjs/mapped-types';
import { CreateOwnerActivityDto } from './create-owner-activity.dto';
import { createOwnerActivityZodSchema } from './create-owner-activity.dto';

export class UpdateOwnerActivityDto extends PartialType(
  CreateOwnerActivityDto,
) {
  static readonly zodSchema = createOwnerActivityZodSchema.partial().strict();
}
