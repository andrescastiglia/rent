import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PropertyOperation, PropertyType } from '../entities/property.entity';
import { Type } from 'class-transformer';

export class CreatePropertyDto {
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsUUID()
  @IsNotEmpty()
  ownerId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  ownerWhatsapp?: string;

  @IsEnum(PropertyType)
  @IsNotEmpty()
  propertyType: PropertyType;

  @IsString()
  @IsNotEmpty()
  addressStreet: string;

  @IsString()
  @IsOptional()
  addressNumber?: string;

  @IsString()
  @IsOptional()
  addressFloor?: string;

  @IsString()
  @IsOptional()
  addressApartment?: string;

  @IsString()
  @IsNotEmpty()
  addressCity: string;

  @IsString()
  @IsOptional()
  addressState?: string;

  @IsString()
  @IsOptional()
  addressCountry?: string;

  @IsString()
  @IsOptional()
  addressPostalCode?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalArea?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  builtArea?: number;

  @IsInt()
  @Min(1800)
  @IsOptional()
  yearBuilt?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  salePrice?: number;

  @IsString()
  @IsOptional()
  saleCurrency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PropertyOperation, { each: true })
  operations?: PropertyOperation[];

  @IsOptional()
  @IsBoolean()
  allowsPets?: boolean;

  @IsOptional()
  acceptedGuaranteeTypes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccupants?: number;
}
