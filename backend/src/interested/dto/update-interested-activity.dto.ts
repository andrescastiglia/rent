import { PartialType } from '@nestjs/mapped-types';
import { CreateInterestedActivityDto } from './create-interested-activity.dto'; // NOSONAR
import { createInterestedActivityZodSchema } from './create-interested-activity.dto'; // NOSONAR

export class UpdateInterestedActivityDto extends PartialType(
  CreateInterestedActivityDto,
) {
  static readonly zodSchema = createInterestedActivityZodSchema
    .partial()
    .strict();
}
