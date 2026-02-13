import { IsOptional, IsString } from 'class-validator';
import { z } from 'zod';

const confirmLeaseDraftZodSchema = z
  .object({
    finalText: z.string().min(1).optional(),
  })
  .strict();

export class ConfirmLeaseDraftDto {
  static readonly zodSchema = confirmLeaseDraftZodSchema;

  @IsString()
  @IsOptional()
  finalText?: string;
}
