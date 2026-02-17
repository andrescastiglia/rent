import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { z } from 'zod';

const convertInterestedToBuyerZodSchema = z
  .object({
    folderId: z.string().uuid().describe('UUID of the sale folder'),
    totalAmount: z.coerce.number().min(1).describe('Total sale amount'),
    installmentAmount: z.coerce
      .number()
      .min(1)
      .describe('Amount per installment'),
    installmentCount: z.coerce
      .number()
      .min(1)
      .describe('Number of installments'),
    startDate: z
      .string()
      .date()
      .describe('First installment date (YYYY-MM-DD)'),
    currency: z.string().optional().describe('Currency code'),
    notes: z.string().optional(),
  })
  .strict();

export class ConvertInterestedToBuyerDto {
  static readonly zodSchema = convertInterestedToBuyerZodSchema;

  @IsUUID()
  folderId: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  totalAmount: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  installmentAmount: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  installmentCount: number;

  @IsDateString()
  startDate: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
