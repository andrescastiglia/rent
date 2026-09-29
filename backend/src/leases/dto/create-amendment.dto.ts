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
    leaseId: z.uuid().describe('UUID of the lease to amend'),
    companyId: z.uuid().describe('UUID of the company'),
    effectiveDate: z.iso
      .date()
      .describe('Date when amendment takes effect (YYYY-MM-DD)'),
    changeType: z
      .enum(AmendmentChangeType)
      .describe(
        'rent_increase|rent_decrease|extension|early_termination|clause_modification|guarantor_change|other',
      ),
    description: z.string().min(1),
    previousValues: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('JSON object with previous field values'),
    newValues: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Strict change payload: rent increase/decrease {monthlyRent}; extension {endDate}; early termination {}; clause modification {termsAndConditions and/or specialClauses}; guarantor_change/other {specialClauses} containing the complete replacement clause text. No arbitrary contract fields.',
      ),
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
