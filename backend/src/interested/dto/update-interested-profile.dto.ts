import { PartialType } from '@nestjs/mapped-types';
import { CreateInterestedProfileDto } from './create-interested-profile.dto'; // NOSONAR
import { createInterestedProfileZodSchema } from './create-interested-profile.dto'; // NOSONAR

export class UpdateInterestedProfileDto extends PartialType(
  CreateInterestedProfileDto,
) {
  static readonly zodSchema = createInterestedProfileZodSchema
    .partial()
    .strict();
}
