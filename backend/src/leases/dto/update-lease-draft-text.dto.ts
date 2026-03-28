import { IsString } from 'class-validator';
import { z } from 'zod';

const updateLeaseDraftTextZodSchema = z
  .object({
    draftText: z.string(),
    draftFormat: z.enum(['plain_text', 'html']).optional(),
  })
  .strict();

export class UpdateLeaseDraftTextDto {
  static readonly zodSchema = updateLeaseDraftTextZodSchema;

  @IsString()
  draftText: string;

  @IsString()
  draftFormat?: 'plain_text' | 'html';
}
