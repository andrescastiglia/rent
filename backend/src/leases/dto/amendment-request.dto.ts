import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { z } from 'zod';
import { CreateAmendmentDto } from './create-amendment.dto';

/** HTTP adds a recovery key without putting transport metadata in contract values. */
export class CreateAmendmentRequestDto extends CreateAmendmentDto {
  static readonly zodSchema = CreateAmendmentDto.zodSchema.extend({
    idempotencyKey: z.uuid().optional(),
  });

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}

export class AmendmentTransitionDto {
  static readonly zodSchema = z
    .object({
      idempotencyKey: z.uuid().optional(),
      expectedUpdatedAt: z.iso.datetime().optional(),
    })
    .strict()
    .default({});

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}
