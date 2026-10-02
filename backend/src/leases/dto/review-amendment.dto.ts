import {
  IsIn,
  IsISO8601,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { z } from 'zod';
import { LeaseAmendment } from '../entities/lease-amendment.entity';

export class ReviewAmendmentDto {
  static readonly zodSchema = z
    .object({
      action: z.enum(['cancel', 'schedule']),
      reason: z.string().trim().min(10).max(2000),
      expectedUpdatedAt: z.iso.datetime(),
      idempotencyKey: z.uuid(),
    })
    .strict();

  @IsIn(['cancel', 'schedule'])
  action: 'cancel' | 'schedule';

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;

  @IsISO8601()
  expectedUpdatedAt: string;

  @IsUUID()
  idempotencyKey: string;
}

export class AmendmentReviewDto {
  id: string;
  amendmentId: string;
  action: 'cancel' | 'schedule';
  reason: string;
  performedBy: string;
  performedAt: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export class ReviewAmendmentResultDto {
  amendment: LeaseAmendment;
  review: AmendmentReviewDto;
}
