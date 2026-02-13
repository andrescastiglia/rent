import { IsIn, IsInt, IsOptional } from 'class-validator';
import { z } from 'zod';

const recentActivityQueryZodSchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .optional()
      .refine((v) => v === undefined || [10, 25, 50].includes(v), {
        message: 'limit must be one of 10, 25, or 50',
      }),
  })
  .strict();

export class RecentActivityQueryDto {
  static readonly zodSchema = recentActivityQueryZodSchema;

  @IsOptional()
  @IsInt()
  @IsIn([10, 25, 50])
  limit?: number;
}
