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
    ownerId: z.string().uuid().optional().describe('Filter by owner UUID'),
    addressCity: z.string().min(1).optional(),
    addressState: z.string().min(1).optional(),
    propertyType: z
      .nativeEnum(PropertyType)
      .optional()
      .describe(
        'apartment|house|commercial|office|warehouse|land|parking|other',
      ),
    status: z
      .nativeEnum(PropertyStatus)
      .optional()
      .describe('active|inactive|under_maintenance|pending_approval'),
    minRent: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Minimum monthly rent filter'),
    maxRent: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Maximum monthly rent filter'),
    minSalePrice: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Minimum sale price filter'),
    maxSalePrice: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Maximum sale price filter'),
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
