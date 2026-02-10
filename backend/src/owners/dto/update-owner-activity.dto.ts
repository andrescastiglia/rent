import { PartialType } from '@nestjs/mapped-types';
import { CreateOwnerActivityDto } from './create-owner-activity.dto';

export class UpdateOwnerActivityDto extends PartialType(
  CreateOwnerActivityDto,
) {}
