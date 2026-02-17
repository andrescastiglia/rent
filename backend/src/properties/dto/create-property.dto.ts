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
import {
  PropertyOperation,
  PropertyOperationState,
  PropertyType,
} from '../entities/property.entity';
import { Type } from 'class-transformer';
import { z } from 'zod';

export const createPropertyZodSchema = z
  .object({
    companyId: z.string().uuid().optional().describe('UUID of the company'),
    ownerId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of the property owner'),
    name: z.string().min(1),
    ownerWhatsapp: z.string().optional(),
    propertyType: z
      .nativeEnum(PropertyType)
      .describe(
        'apartment|house|commercial|office|warehouse|land|parking|other',
      ),
    addressStreet: z.string().min(1),
    addressNumber: z.string().optional(),
    addressFloor: z.string().optional(),
    addressApartment: z.string().optional(),
    addressCity: z.string().min(1),
    addressState: z.string().min(1),
    addressCountry: z.string().optional(),
    addressPostalCode: z.string().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    totalArea: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Total area in square meters'),
    builtArea: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Built area in square meters'),
    yearBuilt: z.coerce.number().int().min(1800).optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
    rentPrice: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Monthly rent price'),
    salePrice: z.coerce.number().min(0).optional().describe('Sale price'),
    saleCurrency: z
      .string()
      .optional()
      .describe('Currency code for sale price (e.g. USD, ARS)'),
    operations: z
      .array(z.nativeEnum(PropertyOperation))
      .min(1)
      .optional()
      .describe('Array of: rent|sale — allowed operation types'),
    operationState: z
      .nativeEnum(PropertyOperationState)
      .optional()
      .describe('available|rented|reserved|sold'),
    allowsPets: z.coerce.boolean().optional(),
    acceptedGuaranteeTypes: z
      .array(z.string())
      .optional()
      .describe('Array of accepted guarantee types'),
    maxOccupants: z.coerce.number().int().min(1).optional(),
    images: z
      .array(z.string())
      .optional()
      .describe('Array of image URLs or storage keys'),
  })
  .strict();

export class CreatePropertyDto {
  static readonly zodSchema = createPropertyZodSchema;

  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

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
  @IsNotEmpty()
  addressState: string;

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
  rentPrice?: number;

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
  @IsEnum(PropertyOperationState)
  operationState?: PropertyOperationState;

  @IsOptional()
  @IsBoolean()
  allowsPets?: boolean;

  @IsOptional()
  acceptedGuaranteeTypes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccupants?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
