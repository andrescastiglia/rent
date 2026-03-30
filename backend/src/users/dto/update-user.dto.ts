import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  UserModulePermissions,
  USER_EMAIL_MAX_LENGTH,
} from '../entities/user.entity';
import { z } from 'zod';

const updateUserZodSchema = z
  .object({
    email: z.string().email().max(USER_EMAIL_MAX_LENGTH).optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    avatarUrl: z.string().min(1).nullable().optional(),
    language: z
      .enum(['es', 'en', 'pt'])
      .optional()
      .describe('User interface language: es|en|pt'),
    permissions: z.record(z.string(), z.boolean()).optional(),
  })
  .strict();

export class UpdateUserDto {
  static readonly zodSchema = updateUserZodSchema;

  @IsEmail()
  @MaxLength(USER_EMAIL_MAX_LENGTH)
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string | null;

  @IsString()
  @IsIn(['es', 'en', 'pt'])
  @IsOptional()
  language?: string;

  @IsObject()
  @IsOptional()
  permissions?: UserModulePermissions;
}
