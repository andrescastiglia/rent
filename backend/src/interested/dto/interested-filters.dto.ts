import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  InterestedOperation,
  InterestedPropertyType,
  InterestedQualificationLevel,
  InterestedStatus,
} from '../entities/interested-profile.entity';
import { z } from 'zod';

const interestedFiltersZodSchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    operation: z.nativeEnum(InterestedOperation).optional(),
    propertyTypePreference: z.nativeEnum(InterestedPropertyType).optional(),
    status: z.nativeEnum(InterestedStatus).optional(),
    qualificationLevel: z.nativeEnum(InterestedQualificationLevel).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  })
  .strict();

export class InterestedFiltersDto {
  static readonly zodSchema = interestedFiltersZodSchema;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(InterestedOperation)
  @IsOptional()
  operation?: InterestedOperation;

  @IsEnum(InterestedPropertyType)
  @IsOptional()
  propertyTypePreference?: InterestedPropertyType;

  @IsEnum(InterestedStatus)
  @IsOptional()
  status?: InterestedStatus;

  @IsEnum(InterestedQualificationLevel)
  @IsOptional()
  qualificationLevel?: InterestedQualificationLevel;

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
