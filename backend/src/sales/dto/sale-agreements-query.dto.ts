import { IsOptional, IsString } from 'class-validator';
import { z } from 'zod';

const saleAgreementsQueryZodSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    folderId: z
      .string()
      .min(1)
      .optional()
      .describe('Filter by sale folder UUID'),
  })
  .strict();

export class SaleAgreementsQueryDto {
  static readonly zodSchema = saleAgreementsQueryZodSchema;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
