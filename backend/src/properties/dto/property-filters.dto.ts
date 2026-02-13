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
import { z } from 'zod';

const propertyFiltersZodSchema = z
  .object({
    ownerId: z.string().uuid().optional(),
    addressCity: z.string().min(1).optional(),
    addressState: z.string().min(1).optional(),
    propertyType: z.nativeEnum(PropertyType).optional(),
    status: z.nativeEnum(PropertyStatus).optional(),
    minRent: z.coerce.number().min(0).optional(),
    maxRent: z.coerce.number().min(0).optional(),
    minSalePrice: z.coerce.number().min(0).optional(),
    maxSalePrice: z.coerce.number().min(0).optional(),
    bedrooms: z.coerce.number().int().min(0).optional(),
    bathrooms: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  })
  .strict();

export class PropertyFiltersDto {
  static readonly zodSchema = propertyFiltersZodSchema;

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
