import { IsOptional, IsString } from 'class-validator';
import { z } from 'zod';

const saleAgreementsQueryZodSchema = z
  .object({
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
}
