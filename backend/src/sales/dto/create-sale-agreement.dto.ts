import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { z } from 'zod';

const createSaleAgreementZodSchema = z
  .object({
    folderId: z.string().min(1).describe('UUID of the sale folder'),
    buyerName: z.string().min(1),
    buyerPhone: z.string().min(1),
    totalAmount: z.coerce.number().min(0).describe('Total sale amount'),
    currency: z.string().optional().describe('Currency code'),
    installmentAmount: z.coerce
      .number()
      .min(0)
      .describe('Amount per installment'),
    installmentCount: z.coerce
      .number()
      .int()
      .min(1)
      .describe('Number of installments'),
    startDate: z
      .string()
      .date()
      .describe('First installment date (YYYY-MM-DD)'),
    dueDay: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Day of month installments are due'),
    notes: z.string().optional(),
  })
  .strict();

export class CreateSaleAgreementDto {
  static readonly zodSchema = createSaleAgreementZodSchema;

  @IsString()
  @IsNotEmpty()
  folderId: string;

  @IsString()
  @IsNotEmpty()
  buyerName: string;

  @IsString()
  @IsNotEmpty()
  buyerPhone: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalAmount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  installmentAmount: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  installmentCount: number;

  @IsDateString()
  startDate: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  dueDay?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
