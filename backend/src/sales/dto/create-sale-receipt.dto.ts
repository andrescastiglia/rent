import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { z } from 'zod';

const createSaleReceiptZodSchema = z
  .object({
    amount: z.coerce.number().min(0.01),
    paymentDate: z.string().date(),
    installmentNumber: z.coerce.number().min(1).optional(),
  })
  .strict();

export class CreateSaleReceiptDto {
  static readonly zodSchema = createSaleReceiptZodSchema;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsDateString()
  paymentDate: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  installmentNumber?: number;
}
