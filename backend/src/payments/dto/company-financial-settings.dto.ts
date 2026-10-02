import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { z } from 'zod';

export class CompanyFinancialSettingsDto {
  static readonly zodSchema = z
    .object({
      commissionTaxRate: z.coerce
        .number()
        .min(0)
        .max(100)
        .refine(
          (value) => /^\d+(?:\.\d{1,2})?$/.test(String(value)),
          'Tax rate supports two decimals',
        ),
      source: z.string().trim().min(5).max(500),
      effectiveFrom: z.iso.date(),
    })
    .strict();
  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionTaxRate: number;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  source: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  effectiveFrom: string;
}

export class CompanyFinancialSettingsViewDto {
  @ApiProperty()
  configured: boolean;
  @ApiProperty({ nullable: true, type: Number })
  commissionTaxRate: number | null;
  @ApiProperty({ nullable: true, type: String })
  source: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' })
  effectiveFrom: string | null;
}
