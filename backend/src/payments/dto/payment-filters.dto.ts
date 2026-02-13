import { IsOptional, IsEnum, IsDateString, Matches } from 'class-validator';
import { PaymentStatus, PaymentMethod } from '../entities/payment.entity';
import { z } from 'zod';

const UUID_CANONICAL_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalPositiveInt = z.coerce.number().int().min(1).optional();

const paymentFiltersZodSchema = z
  .object({
    tenantId: z
      .string()
      .regex(UUID_CANONICAL_REGEX, 'tenantId must be a UUID')
      .optional(),
    tenantAccountId: z
      .string()
      .regex(UUID_CANONICAL_REGEX, 'tenantAccountId must be a UUID')
      .optional(),
    leaseId: z
      .string()
      .regex(UUID_CANONICAL_REGEX, 'leaseId must be a UUID')
      .optional(),
    status: z.nativeEnum(PaymentStatus).optional(),
    method: z.nativeEnum(PaymentMethod).optional(),
    fromDate: z.string().date().optional(),
    toDate: z.string().date().optional(),
    page: optionalPositiveInt,
    limit: optionalPositiveInt,
  })
  .strict();

export class PaymentFiltersDto {
  static readonly zodSchema = paymentFiltersZodSchema;

  @IsOptional()
  @Matches(UUID_CANONICAL_REGEX, { message: 'tenantId must be a UUID' })
  tenantId?: string;

  @IsOptional()
  @Matches(UUID_CANONICAL_REGEX, {
    message: 'tenantAccountId must be a UUID',
  })
  tenantAccountId?: string;

  @IsOptional()
  @Matches(UUID_CANONICAL_REGEX, { message: 'leaseId must be a UUID' })
  leaseId?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
