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
  IsNumber,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { z } from 'zod';
import { USER_EMAIL_MAX_LENGTH } from '../../users/entities/user.entity';
import { CommunicationChannel } from '../../communications/entities/communication-template.entity';
import { EmploymentStatus } from '../entities/tenant.entity';

export const createTenantZodSchema = z
  .object({
    companyId: z
      .uuid()
      .optional()
      .describe(
        'Optional legacy company reference; authenticated actor determines scope',
      ),
    email: z.email().max(USER_EMAIL_MAX_LENGTH).nullable().optional(),
    password: z.string().min(8).optional(),
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
    cuil: z.string().max(20).optional(),
    dateOfBirth: z.iso.date().optional(),
    nationality: z.string().max(100).optional(),
    occupation: z.string().max(100).optional(),
    employer: z.string().max(200).optional(),
    monthlyIncome: z.number().nonnegative().optional(),
    employmentStatus: z.enum(EmploymentStatus).optional(),
    emergencyContactName: z.string().max(200).optional(),
    emergencyContactPhone: z.string().max(50).optional(),
    emergencyContactRelationship: z.string().max(100).optional(),
    creditScore: z.number().int().min(0).max(1000).optional(),
    notes: z.string().max(10000).optional(),
  })
  .strict();

export class CreateTenantDto {
  static readonly zodSchema = createTenantZodSchema;

  // Company reference
  @IsUUID()
  @IsOptional()
  companyId?: string;

  // User fields
  @IsEmail()
  @MaxLength(USER_EMAIL_MAX_LENGTH)
  @IsOptional()
  email?: string | null;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

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

  @IsString()
  @MaxLength(20)
  @IsOptional()
  cuil?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  nationality?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  occupation?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  employer?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyIncome?: number;

  @IsEnum(EmploymentStatus)
  @IsOptional()
  employmentStatus?: EmploymentStatus;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  emergencyContactName?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  emergencyContactPhone?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  emergencyContactRelationship?: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  creditScore?: number;

  @IsString()
  @MaxLength(10000)
  @IsOptional()
  notes?: string;
}
