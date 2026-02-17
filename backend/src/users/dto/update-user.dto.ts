import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { z } from 'zod';

const updateUserZodSchema = z
  .object({
    email: z.string().email().optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    avatarUrl: z.string().min(1).nullable().optional(),
    language: z
      .enum(['es', 'en', 'pt'])
      .optional()
      .describe('User interface language: es|en|pt'),
  })
  .strict();

export class UpdateUserDto {
  static readonly zodSchema = updateUserZodSchema;

  @IsEmail()
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
}
