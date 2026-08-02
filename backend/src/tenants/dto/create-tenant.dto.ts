import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsEnum,
  MaxLength,
  MinLength,
} from 'class-validator';
import { z } from 'zod';
import { USER_EMAIL_MAX_LENGTH } from '../../users/entities/user.entity';
import { CommunicationChannel } from '../../communications/entities/communication-template.entity';

export const createTenantZodSchema = z
  .object({
    companyId: z.uuid().describe('UUID of the company this tenant belongs to'),
    email: z.string().email().max(USER_EMAIL_MAX_LENGTH),
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
    contactConsent: z.coerce.boolean().optional(),
    preferredContactChannel: z.enum(CommunicationChannel).optional(),
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

  @IsBoolean()
  @IsOptional()
  contactConsent?: boolean;

  @IsEnum(CommunicationChannel)
  @IsOptional()
  preferredContactChannel?: CommunicationChannel;
}
