import { PartialType } from '@nestjs/mapped-types';
import {
  CreateInterestedProfileDto,
  createInterestedProfileZodSchema,
} from './create-interested-profile.dto';

export class UpdateInterestedProfileDto extends PartialType(
  CreateInterestedProfileDto,
) {
  static readonly zodSchema = createInterestedProfileZodSchema
    .partial()
    .strict();
}
