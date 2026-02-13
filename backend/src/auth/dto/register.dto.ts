import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';
import { z } from 'zod';

const registerZodSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z
      .nativeEnum(UserRole)
      .refine((value) => value === UserRole.OWNER || value === UserRole.TENANT)
      .optional()
      .default(UserRole.TENANT),
    phone: z.string().min(1).optional(),
  })
  .strict();

export class RegisterDto {
  static readonly zodSchema = registerZodSchema;

  @IsEmail()
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
}
