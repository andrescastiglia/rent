import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { z } from 'zod';
import { InvoiceStatus } from '../entities/invoice.entity';

const invoiceFiltersZodSchema = z
  .object({
    leaseId: z.string().uuid().optional().describe('Filter by lease UUID'),
    ownerId: z.string().uuid().optional().describe('Filter by owner UUID'),
    status: z
      .nativeEnum(InvoiceStatus)
      .optional()
      .describe('draft|pending|sent|partial|paid|overdue|cancelled|refunded'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  })
  .strict();

export class InvoiceFiltersDto {
  static readonly zodSchema = invoiceFiltersZodSchema;

  @IsOptional()
  @IsUUID()
  leaseId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
