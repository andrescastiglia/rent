import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { z } from 'zod';
import { USER_EMAIL_MAX_LENGTH } from '../../users/entities/user.entity';

const convertInterestedToTenantZodSchema = z
  .object({
    email: z.string().email().max(USER_EMAIL_MAX_LENGTH).optional(),
    password: z.string().min(8).optional(),
    dni: z
      .string()
      .optional()
      .describe('National ID number for the new tenant record'),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
  })
  .strict();

export class ConvertInterestedToTenantDto {
  static readonly zodSchema = convertInterestedToTenantZodSchema;

  @IsEmail()
  @MaxLength(USER_EMAIL_MAX_LENGTH)
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  dni?: string;

  @IsString()
  @IsOptional()
  emergencyContactName?: string;

  @IsString()
  @IsOptional()
  emergencyContactPhone?: string;
}
