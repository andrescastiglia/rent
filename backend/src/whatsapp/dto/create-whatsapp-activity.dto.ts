import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { z } from 'zod';

export const createWhatsappActivityZodSchema = z
  .object({
    requestId: z.uuid(),
    personType: z.enum(['tenant', 'interested']),
    personId: z.uuid(),
    subject: z.string().trim().min(1).max(200),
    body: z.string().max(3800).optional(),
    dueAt: z.union([z.iso.date(), z.iso.datetime()]).optional(),
    propertyId: z.uuid().optional(),
    markReserved: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.personType === 'interested' ||
      (!value.propertyId && !value.markReserved),
    { message: 'Reservations are only supported for interested profiles' },
  )
  .refine((value) => !value.markReserved || Boolean(value.propertyId), {
    message: 'propertyId is required when markReserved is true',
  });

export class CreateWhatsappActivityDto {
  static readonly zodSchema = createWhatsappActivityZodSchema;

  @IsUUID()
  requestId: string;

  @IsIn(['tenant', 'interested'])
  personType: 'tenant' | 'interested';

  @IsUUID()
  personId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject: string;

  @IsOptional()
  @IsString()
  @MaxLength(3800)
  body?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsBoolean()
  markReserved?: boolean;
}
