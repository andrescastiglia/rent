import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { z } from 'zod';

const tenantFiltersZodSchema = z
  .object({
    name: z.string().min(1).optional().describe('Text search by tenant name'),
    dni: z.string().min(1).optional().describe('National ID number filter'),
    email: z.string().min(1).optional().describe('Email filter'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  })
  .strict();

export class TenantFiltersDto {
  static readonly zodSchema = tenantFiltersZodSchema;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  dni?: string;

  @IsString()
  @IsOptional()
  email?: string;

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
