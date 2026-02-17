import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { z } from 'zod';

const loginZodSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
    captchaToken: z.string().min(1).optional(),
  })
  .strict();

export class LoginDto {
  static readonly zodSchema = loginZodSchema;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  captchaToken?: string;
}
