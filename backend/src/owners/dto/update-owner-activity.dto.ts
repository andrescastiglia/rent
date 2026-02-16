import { PartialType } from '@nestjs/mapped-types';
import {
  CreateOwnerActivityDto,
  createOwnerActivityZodSchema,
} from './create-owner-activity.dto';

export class UpdateOwnerActivityDto extends PartialType(
  CreateOwnerActivityDto,
) {
  static readonly zodSchema = createOwnerActivityZodSchema.partial().strict();
}
