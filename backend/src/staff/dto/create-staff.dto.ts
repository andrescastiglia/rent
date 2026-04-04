import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { z } from 'zod';
import { StaffSpecialization } from '../entities/staff.entity';
import { USER_EMAIL_MAX_LENGTH } from '../../users/entities/user.entity';

export const createStaffZodSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z
      .union([z.string().email().max(USER_EMAIL_MAX_LENGTH), z.literal('')])
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }),
    phone: z.string().optional(),
    specialization: z.nativeEnum(StaffSpecialization),
    hourlyRate: z.coerce.number().min(0).optional(),
    currency: z.string().optional().default('ARS'),
    serviceAreas: z.array(z.string()).optional(),
    certifications: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .strict();

export class CreateStaffDto {
  static readonly zodSchema = createStaffZodSchema;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  @MaxLength(USER_EMAIL_MAX_LENGTH)
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(StaffSpecialization)
  specialization: StaffSpecialization;

  @IsNumber()
  @Min(0)
  @IsOptional()
  hourlyRate?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serviceAreas?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  certifications?: string[];

  @IsString()
  @IsOptional()
  notes?: string;
}
