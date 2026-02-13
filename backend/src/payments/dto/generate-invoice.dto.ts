import { IsBoolean, IsDateString, IsOptional } from 'class-validator';
import { z } from 'zod';

const generateInvoiceZodSchema = z
  .object({
    issue: z.coerce.boolean().optional(),
    applyLateFee: z.coerce.boolean().optional(),
    applyAdjustment: z.coerce.boolean().optional(),
    periodStart: z.string().date().optional(),
    periodEnd: z.string().date().optional(),
    dueDate: z.string().date().optional(),
  })
  .strict();

export class GenerateInvoiceDto {
  static readonly zodSchema = generateInvoiceZodSchema;

  @IsBoolean()
  @IsOptional()
  issue?: boolean;

  @IsBoolean()
  @IsOptional()
  applyLateFee?: boolean;

  @IsBoolean()
  @IsOptional()
  applyAdjustment?: boolean;

  @IsDateString()
  @IsOptional()
  periodStart?: string;

  @IsDateString()
  @IsOptional()
  periodEnd?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
