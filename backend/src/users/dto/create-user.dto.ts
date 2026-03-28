import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserModulePermissions, UserRole } from '../entities/user.entity';
import { z } from 'zod';

const createUserZodSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(UserRole).describe('admin|owner|tenant|staff|buyer'),
    phone: z.string().min(1).optional(),
    permissions: z.record(z.string(), z.boolean()).optional(),
  })
  .strict();

export class CreateUserDto {
  static readonly zodSchema = createUserZodSchema;

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

  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsObject()
  @IsOptional()
  permissions?: UserModulePermissions;
}
