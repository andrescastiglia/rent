import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PropertyType, PropertyStatus } from '../entities/property.entity';
import { Type } from 'class-transformer';

export class PropertyFiltersDto {
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsString()
  @IsOptional()
  addressCity?: string;

  @IsString()
  @IsOptional()
  addressState?: string;

  @IsEnum(PropertyType)
  @IsOptional()
  propertyType?: PropertyType;

  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minRent?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxRent?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minSalePrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxSalePrice?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  bedrooms?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  bathrooms?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;
}
