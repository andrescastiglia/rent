import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { z } from 'zod';

const registerOwnerSettlementPaymentZodSchema = z
  .object({
    paymentDate: z
      .string()
      .date()
      .optional()
      .describe('Date of payment (YYYY-MM-DD)'),
    reference: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    amount: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Payment amount — must match settlement net amount exactly'),
  })
  .strict();

export class RegisterOwnerSettlementPaymentDto {
  static readonly zodSchema = registerOwnerSettlementPaymentZodSchema;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}
