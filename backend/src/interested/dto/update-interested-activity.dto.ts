import { PartialType } from '@nestjs/mapped-types';
import { CreateInterestedActivityDto } from './create-interested-activity.dto';

export class UpdateInterestedActivityDto extends PartialType(
  CreateInterestedActivityDto,
) {}
