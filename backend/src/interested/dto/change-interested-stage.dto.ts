import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InterestedStatus } from '../entities/interested-profile.entity';
import { z } from 'zod';

const changeInterestedStageZodSchema = z
  .object({
    toStatus: z
      .nativeEnum(InterestedStatus)
      .describe('interested|tenant|buyer — target pipeline status'),
    reason: z.string().optional(),
  })
  .strict();

export class ChangeInterestedStageDto {
  static readonly zodSchema = changeInterestedStageZodSchema;

  @IsEnum(InterestedStatus)
  toStatus: InterestedStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}
