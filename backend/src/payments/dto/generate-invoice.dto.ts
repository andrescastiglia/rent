import { IsBoolean, IsDateString, IsOptional } from 'class-validator';
import { z } from 'zod';

const generateInvoiceZodSchema = z
  .object({
    issue: z.coerce
      .boolean()
      .optional()
      .describe('Auto-issue the invoice after generation'),
    applyLateFee: z.coerce
      .boolean()
      .optional()
      .describe('Calculate and apply late fees'),
    applyAdjustment: z.coerce
      .boolean()
      .optional()
      .describe('Calculate and apply rent adjustment'),
    periodStart: z
      .string()
      .date()
      .optional()
      .describe('Custom period start (YYYY-MM-DD)'),
    periodEnd: z
      .string()
      .date()
      .optional()
      .describe('Custom period end (YYYY-MM-DD)'),
    dueDate: z
      .string()
      .date()
      .optional()
      .describe('Custom due date (YYYY-MM-DD)'),
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
