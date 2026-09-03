import { IsNotEmpty, IsString } from 'class-validator';
import { z } from 'zod';

const reauthenticateZodSchema = z
  .object({ password: z.string().min(1).max(200) })
  .strict();

export class ReauthenticateDto {
  static readonly zodSchema = reauthenticateZodSchema;

  @IsString()
  @IsNotEmpty()
  password: string;
}
