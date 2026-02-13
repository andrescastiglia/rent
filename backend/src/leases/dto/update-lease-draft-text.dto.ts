import { IsString } from 'class-validator';
import { z } from 'zod';

const updateLeaseDraftTextZodSchema = z
  .object({
    draftText: z.string(),
  })
  .strict();

export class UpdateLeaseDraftTextDto {
  static readonly zodSchema = updateLeaseDraftTextZodSchema;

  @IsString()
  draftText: string;
}
