import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';

const listOwnerSettlementPaymentsZodSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  })
  .strict();

export class ListOwnerSettlementPaymentsDto {
  static readonly zodSchema = listOwnerSettlementPaymentsZodSchema;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
