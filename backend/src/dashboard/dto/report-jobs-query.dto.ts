import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';

const reportJobsQueryZodSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export class ReportJobsQueryDto {
  static readonly zodSchema = reportJobsQueryZodSchema;

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
