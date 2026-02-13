import { IsOptional, IsString } from 'class-validator';
import { z } from 'zod';

const leaseStatusReasonZodSchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();

export class LeaseStatusReasonDto {
  static readonly zodSchema = leaseStatusReasonZodSchema;

  @IsOptional()
  @IsString()
  reason?: string;
}
