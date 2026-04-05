import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { PortalName } from '../entities/portal-listing.entity';

export class CreatePortalListingDto {
  @IsUUID()
  propertyId: string;

  @IsEnum(PortalName)
  portal: PortalName;

  @IsObject()
  @IsOptional()
  listingData?: Record<string, unknown>;
}
