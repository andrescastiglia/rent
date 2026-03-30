import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  UserRole,
  USER_EMAIL_MAX_LENGTH,
} from '../../users/entities/user.entity';
import { z } from 'zod';

const registerZodSchema = z
  .object({
    email: z.string().email().max(USER_EMAIL_MAX_LENGTH),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z
      .enum(UserRole)
      .refine((value) => value === UserRole.OWNER || value === UserRole.TENANT)
      .optional()
      .default(UserRole.TENANT),
    phone: z.string().min(1).optional(),
    captchaToken: z.string().min(1).optional(),
  })
  .strict();

export class RegisterDto {
  static readonly zodSchema = registerZodSchema;

  @IsEmail()
  @MaxLength(USER_EMAIL_MAX_LENGTH)
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsIn([UserRole.OWNER, UserRole.TENANT])
  @IsOptional()
  role?: UserRole = UserRole.TENANT;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  captchaToken?: string;
}
