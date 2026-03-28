import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { z } from 'zod';

const createSaleAgreementZodSchema = z
  .object({
    folderId: z.string().min(1).describe('UUID of the sale folder'),
    buyerId: z.uuid().describe('UUID of the buyer entity'),
    buyerName: z.string().min(1).optional(),
    buyerPhone: z.string().min(1).optional(),
    buyerEmail: z.email().optional(),
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
    startDate: z.iso.date().describe('First installment date (YYYY-MM-DD)'),
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

  @IsUUID()
  buyerId: string;

  @IsString()
  @IsOptional()
  buyerName?: string;

  @IsString()
  @IsOptional()
  buyerPhone?: string;

  @IsString()
  @IsOptional()
  buyerEmail?: string;

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
