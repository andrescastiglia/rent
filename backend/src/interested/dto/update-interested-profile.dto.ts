import { PartialType } from '@nestjs/mapped-types';
import { CreateInterestedProfileDto } from './create-interested-profile.dto';

export class UpdateInterestedProfileDto extends PartialType(
  CreateInterestedProfileDto,
) {}
