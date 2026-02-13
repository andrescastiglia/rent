import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';

const userListQueryZodSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  })
  .strict();

export class UserListQueryDto {
  static readonly zodSchema = userListQueryZodSchema;

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
