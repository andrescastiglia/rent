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
    leaseId: z.string().uuid(),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    subtotal: z.coerce.number().min(0),
    lateFee: z.coerce.number().min(0).optional().default(0),
    adjustments: z.coerce.number().optional().default(0),
    dueDate: z.string().date(),
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
