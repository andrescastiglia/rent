import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { z } from 'zod';
import { BUYER_DNI_MAX_LENGTH } from '../entities/buyer.entity';
import { USER_EMAIL_MAX_LENGTH } from '../../users/entities/user.entity';

export const createBuyerZodSchema = z
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
    dni: z.string().max(BUYER_DNI_MAX_LENGTH).optional(),
    interestedProfileId: z.uuid().optional(),
    notes: z.string().optional(),
    password: z.string().min(8).optional(),
  })
  .strict();

export class CreateBuyerDto {
  static readonly zodSchema = createBuyerZodSchema;

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

  @IsString()
  @MaxLength(BUYER_DNI_MAX_LENGTH)
  @IsOptional()
  dni?: string;

  @IsUUID()
  @IsOptional()
  interestedProfileId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
