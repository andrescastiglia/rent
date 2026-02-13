import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { z } from 'zod';

const convertInterestedToTenantZodSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    dni: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
  })
  .strict();

export class ConvertInterestedToTenantDto {
  static readonly zodSchema = convertInterestedToTenantZodSchema;

  @IsEmail()
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
