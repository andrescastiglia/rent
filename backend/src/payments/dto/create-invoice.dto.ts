import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { z } from 'zod';

const createInvoiceZodSchema = z
  .object({
    leaseId: z
      .string()
      .uuid()
      .describe('UUID of the lease this invoice belongs to'),
    periodStart: z
      .string()
      .date()
      .describe('Billing period start (YYYY-MM-DD)'),
    periodEnd: z.string().date().describe('Billing period end (YYYY-MM-DD)'),
    subtotal: z.coerce
      .number()
      .min(0)
      .describe('Invoice subtotal before fees and adjustments'),
    lateFee: z.coerce
      .number()
      .min(0)
      .optional()
      .default(0)
      .describe('Late fee amount (default: 0)'),
    adjustments: z.coerce
      .number()
      .optional()
      .default(0)
      .describe('Adjustment amount (default: 0)'),
    dueDate: z.string().date().describe('Invoice due date (YYYY-MM-DD)'),
    invoiceNumber: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();

/**
 * DTO para crear una nueva factura.
 */
export class CreateInvoiceDto {
  static readonly zodSchema = createInvoiceZodSchema;

  @IsUUID()
  @IsNotEmpty()
  leaseId: string;

  @IsDateString()
  @IsNotEmpty()
  periodStart: string;

  @IsDateString()
  @IsNotEmpty()
  periodEnd: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  subtotal: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  lateFee?: number = 0;

  @IsNumber()
  @IsOptional()
  adjustments?: number = 0;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
