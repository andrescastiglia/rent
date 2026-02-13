import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { z } from 'zod';

const changePasswordZodSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  })
  .strict();

export class ChangePasswordDto {
  static readonly zodSchema = changePasswordZodSchema;

  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  newPassword: string;
}
