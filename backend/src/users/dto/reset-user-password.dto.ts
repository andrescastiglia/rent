import { IsOptional, IsString, MinLength } from 'class-validator';
import { z } from 'zod';

const resetUserPasswordZodSchema = z
  .object({
    newPassword: z.string().min(8).optional(),
  })
  .strict();

export class ResetUserPasswordDto {
  static readonly zodSchema = resetUserPasswordZodSchema;

  @IsString()
  @MinLength(8)
  @IsOptional()
  newPassword?: string;
}
