import { z } from 'zod';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { SettlementStatus } from '../entities/settlement.entity';

export const settlementSummaryFiltersSchema = z
  .object({
    ownerId: z.uuid().optional(),
    status: z.enum(SettlementStatus).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    periodStart: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    periodEnd: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
  })
  .strict();
export const settlementFiltersSchema = settlementSummaryFiltersSchema.extend({
  limit: z.number().int().min(1).max(500).optional(),
});

export class SettlementSummaryFiltersDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ enum: SettlementStatus })
  @IsEnum(SettlementStatus)
  @IsOptional()
  status?: SettlementStatus;

  @ApiPropertyOptional({ pattern: '^[A-Z]{3}$', example: 'ARS' })
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
    example: '2026-09',
  })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  @IsOptional()
  periodStart?: string;

  @ApiPropertyOptional({
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
    example: '2026-09',
  })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  @IsOptional()
  periodEnd?: string;
}

export class SettlementFiltersDto extends SettlementSummaryFiltersDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number;
}
