import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { CreatePortalListingDto } from './create-portal-listing.dto';
import { PortalListingStatus } from '../entities/portal-listing.entity';

export class UpdatePortalListingDto extends PartialType(
  CreatePortalListingDto,
) {
  @IsEnum(PortalListingStatus)
  @IsOptional()
  status?: PortalListingStatus;
}
