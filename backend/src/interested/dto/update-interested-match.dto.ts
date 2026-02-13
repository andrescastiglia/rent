import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InterestedMatchStatus } from '../entities/interested-property-match.entity';
import { z } from 'zod';

const updateInterestedMatchZodSchema = z
  .object({
    status: z.nativeEnum(InterestedMatchStatus),
    notes: z.string().optional(),
  })
  .strict();

export class UpdateInterestedMatchDto {
  static readonly zodSchema = updateInterestedMatchZodSchema;

  @IsEnum(InterestedMatchStatus)
  status: InterestedMatchStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
