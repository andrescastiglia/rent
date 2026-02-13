import { PartialType } from '@nestjs/mapped-types';
import { CreateInterestedProfileDto } from './create-interested-profile.dto';
import { createInterestedProfileZodSchema } from './create-interested-profile.dto';

export class UpdateInterestedProfileDto extends PartialType(
  CreateInterestedProfileDto,
) {
  static readonly zodSchema = createInterestedProfileZodSchema
    .partial()
    .strict();
}
