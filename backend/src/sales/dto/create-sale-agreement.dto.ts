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
    folderId: z.string().min(1),
    buyerName: z.string().min(1),
    buyerPhone: z.string().min(1),
    totalAmount: z.coerce.number().min(0),
    currency: z.string().optional(),
    installmentAmount: z.coerce.number().min(0),
    installmentCount: z.coerce.number().int().min(1),
    startDate: z.string().date(),
    dueDay: z.coerce.number().int().min(1).optional(),
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
