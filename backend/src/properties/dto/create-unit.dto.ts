import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  Min,
} from 'class-validator';
import { UnitStatus } from '../entities/unit.entity';
import { z } from 'zod';

export const createUnitZodSchema = z
  .object({
    propertyId: z.string().uuid().describe('UUID of the parent property'),
    companyId: z.string().uuid().optional().describe('UUID of the company'),
    unitNumber: z.string().min(1),
    floor: z.string().optional(),
    bedrooms: z.coerce.number().int().min(0).optional().default(0),
    bathrooms: z.coerce.number().min(0).optional().default(0),
    area: z.coerce.number().min(0.01),
    baseRent: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Base monthly rent for this unit'),
    currency: z
      .string()
      .optional()
      .default('ARS')
      .describe('Currency code (default: ARS)'),
    unitType: z.string().optional(),
    hasParking: z.coerce.boolean().optional().default(false),
    parkingSpots: z.coerce.number().int().optional().default(0),
    hasStorage: z.coerce.boolean().optional().default(false),
    isFurnished: z.coerce.boolean().optional().default(false),
    expenses: z.coerce
      .number()
      .optional()
      .describe('Monthly expenses/common charges amount'),
    status: z
      .nativeEnum(UnitStatus)
      .optional()
      .default(UnitStatus.AVAILABLE)
      .describe('available|occupied|maintenance|reserved'),
    description: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export class CreateUnitDto {
  static readonly zodSchema = createUnitZodSchema;

  @IsUUID()
  @IsNotEmpty()
  propertyId: string;

  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsString()
  @IsNotEmpty()
  unitNumber: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  bedrooms?: number = 0;

  @IsNumber()
  @Min(0)
  @IsOptional()
  bathrooms?: number = 0;

  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  area: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseRent?: number;

  @IsString()
  @IsOptional()
  currency?: string = 'ARS';

  @IsString()
  @IsOptional()
  unitType?: string;

  @IsBoolean()
  @IsOptional()
  hasParking?: boolean = false;

  @IsInt()
  @IsOptional()
  parkingSpots?: number = 0;

  @IsBoolean()
  @IsOptional()
  hasStorage?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isFurnished?: boolean = false;

  @IsNumber()
  @IsOptional()
  expenses?: number;

  @IsEnum(UnitStatus)
  @IsOptional()
  status?: UnitStatus = UnitStatus.AVAILABLE;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
