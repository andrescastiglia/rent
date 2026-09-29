import { IsObject } from 'class-validator';

export class UpdatePortalListingDto {
  @IsObject()
  listingData: Record<string, unknown>;
}
