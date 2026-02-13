import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '../entities/owner.entity';
import { z } from 'zod';

export const createOwnerZodSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email(),
    phone: z.string().optional(),
    taxId: z.string().optional(),
    taxIdType: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountType: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankCbu: z.string().optional(),
    bankAlias: z.string().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    commissionRate: z.coerce.number().optional(),
    notes: z.string().optional(),
    password: z.string().min(8).optional(),
  })
  .strict();

export class CreateOwnerDto {
  static readonly zodSchema = createOwnerZodSchema;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  taxIdType?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  bankAccountType?: string;

  @IsString()
  @IsOptional()
  bankAccountNumber?: string;

  @IsString()
  @IsOptional()
  bankCbu?: string;

  @IsString()
  @IsOptional()
  bankAlias?: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsNumber()
  @IsOptional()
  commissionRate?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
