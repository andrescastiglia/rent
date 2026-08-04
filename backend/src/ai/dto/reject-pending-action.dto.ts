import { IsOptional, IsString, MaxLength } from 'class-validator';
import { z } from 'zod';

export class RejectPendingActionDto {
  static readonly zodSchema = z
    .object({ reason: z.string().max(500).optional() })
    .strict();

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
