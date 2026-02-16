import { PartialType } from '@nestjs/mapped-types';
import {
  CreateInterestedActivityDto,
  createInterestedActivityZodSchema,
} from './create-interested-activity.dto';

export class UpdateInterestedActivityDto extends PartialType(
  CreateInterestedActivityDto,
) {
  static readonly zodSchema = createInterestedActivityZodSchema
    .partial()
    .strict();
}
