import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { AmendmentChangeType } from '../entities/lease-amendment.entity';
import { z } from 'zod';

const createAmendmentZodSchema = z
  .object({
    leaseId: z.string().uuid(),
    companyId: z.string().uuid(),
    effectiveDate: z.string().date(),
    changeType: z.nativeEnum(AmendmentChangeType),
    description: z.string().min(1),
    previousValues: z.record(z.string(), z.unknown()).optional(),
    newValues: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export class CreateAmendmentDto {
  static readonly zodSchema = createAmendmentZodSchema;

  @IsUUID()
  @IsNotEmpty()
  leaseId: string;

  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsDateString()
  @IsNotEmpty()
  effectiveDate: string;

  @IsEnum(AmendmentChangeType)
  @IsNotEmpty()
  changeType: AmendmentChangeType;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  previousValues?: Record<string, any>;

  @IsOptional()
  newValues?: Record<string, any>;
}
