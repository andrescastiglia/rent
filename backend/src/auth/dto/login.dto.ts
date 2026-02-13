import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { z } from 'zod';

const loginZodSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
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
}
