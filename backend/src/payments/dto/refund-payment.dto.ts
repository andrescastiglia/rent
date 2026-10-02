import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { z } from 'zod';

export class RefundPaymentDto {
  static readonly zodSchema = z
    .object({
      amount: z.coerce.number().positive(),
      reason: z.string().trim().min(5).max(2000),
      reference: z.string().trim().min(1).max(255).optional(),
    })
    .strict();

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;
}
