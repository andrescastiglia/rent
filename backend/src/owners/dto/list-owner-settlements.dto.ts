import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';

const listOwnerSettlementsZodSchema = z
  .object({
    status: z
      .enum(['all', 'pending', 'completed'])
      .optional()
      .default('all')
      .describe('all|pending|completed — settlement status filter'),
    limit: z.coerce.number().int().min(1).max(100).optional().default(12),
  })
  .strict();

export class ListOwnerSettlementsDto {
  static readonly zodSchema = listOwnerSettlementsZodSchema;

  @IsOptional()
  @IsIn(['all', 'pending', 'completed'])
  status?: 'all' | 'pending' | 'completed';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
