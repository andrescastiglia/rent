import { ApiProperty } from '@nestjs/swagger';
export class MercadoLibreOptionDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}
export class MercadoLibreAttributeDto extends MercadoLibreOptionDto {
  @ApiProperty() valueType: string;
  @ApiProperty() required: boolean;
  @ApiProperty() readOnly: boolean;
  @ApiProperty() maxLength: number;
  @ApiProperty({ type: MercadoLibreOptionDto, isArray: true })
  values: MercadoLibreOptionDto[];
  @ApiProperty({ type: MercadoLibreOptionDto, isArray: true })
  units: MercadoLibreOptionDto[];
  @ApiProperty({ type: String, nullable: true }) defaultUnit: string | null;
}
export class MercadoLibreListingTypeDto extends MercadoLibreOptionDto {
  @ApiProperty({ type: Number, nullable: true }) remainingListings:
    number | null;
}
export class MercadoLibreCategoryDto extends MercadoLibreOptionDto {
  @ApiProperty({ type: MercadoLibreOptionDto, isArray: true })
  path: MercadoLibreOptionDto[];
  @ApiProperty({ type: MercadoLibreOptionDto, isArray: true })
  children: MercadoLibreOptionDto[];
  @ApiProperty() listingAllowed: boolean;
  @ApiProperty({ type: String, isArray: true }) currencies: string[];
  @ApiProperty({ type: MercadoLibreAttributeDto, isArray: true })
  attributes: MercadoLibreAttributeDto[];
  @ApiProperty({ type: MercadoLibreListingTypeDto, isArray: true })
  listingTypes: MercadoLibreListingTypeDto[];
}
