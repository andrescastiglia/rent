import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { z } from 'zod';

export const createTenantZodSchema = z
  .object({
    companyId: z
      .string()
      .uuid()
      .describe('UUID of the company this tenant belongs to'),
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().min(1).optional(),
    dni: z
      .string()
      .min(1)
      .describe('National identification number (DNI/CUIT/CPF)'),
    emergencyContact: z.string().min(1).optional(),
    emergencyPhone: z.string().min(1).optional(),
  })
  .strict();

export class CreateTenantDto {
  static readonly zodSchema = createTenantZodSchema;

  // Company reference
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  // User fields
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

  @IsString()
  @IsOptional()
  phone?: string;

  // Tenant-specific fields
  @IsString()
  @IsNotEmpty()
  dni: string;

  @IsString()
  @IsOptional()
  emergencyContact?: string;

  @IsString()
  @IsOptional()
  emergencyPhone?: string;
}
