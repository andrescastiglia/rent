import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ContractType, LeaseStatus } from '../entities/lease.entity';
import { z } from 'zod';

const toBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true');

const leaseFiltersZodSchema = z
  .object({
    propertyId: z
      .string()
      .uuid()
      .optional()
      .describe('Filter by property UUID'),
    tenantId: z.string().uuid().optional().describe('Filter by tenant UUID'),
    buyerProfileId: z
      .string()
      .uuid()
      .optional()
      .describe('Filter by buyer profile UUID'),
    status: z
      .nativeEnum(LeaseStatus)
      .optional()
      .describe('draft|active|finalized'),
    contractType: z.nativeEnum(ContractType).optional().describe('rental|sale'),
    propertyAddress: z
      .string()
      .min(1)
      .optional()
      .describe('Text search by property address'),
    includeFinalized: toBoolean
      .optional()
      .default(false)
      .describe('Include finalized leases (default: false)'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  })
  .strict();

export class LeaseFiltersDto {
  static readonly zodSchema = leaseFiltersZodSchema;

  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsUUID()
  @IsOptional()
  buyerProfileId?: string;

  @IsEnum(LeaseStatus)
  @IsOptional()
  status?: LeaseStatus;

  @IsEnum(ContractType)
  @IsOptional()
  contractType?: ContractType;

  @IsString()
  @IsOptional()
  propertyAddress?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  includeFinalized?: boolean = false;

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
