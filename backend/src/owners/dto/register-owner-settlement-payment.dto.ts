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
    paymentDate: z.string().date().optional(),
    reference: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    amount: z.coerce.number().min(0).optional(),
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
