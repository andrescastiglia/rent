import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { z } from 'zod';

export class ScheduledBillingDto {
  static readonly zodSchema = z
    .object({
      billingDate: z.iso.date(),
      dryRun: z.boolean().optional(),
      companyId: z.uuid().optional(),
      leaseId: z.uuid().optional(),
      afterLeaseId: z.uuid().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    })
    .strict();

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  billingDate: string;
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;
  @IsUUID()
  @IsOptional()
  companyId?: string;
  @IsUUID()
  @IsOptional()
  leaseId?: string;
  @IsUUID()
  @IsOptional()
  afterLeaseId?: string;
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
