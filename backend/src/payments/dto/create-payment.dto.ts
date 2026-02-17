import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../entities/payment.entity';
import { PaymentItemDto, paymentItemZodSchema } from './payment-item.dto';
import { Type } from 'class-transformer';
import { z } from 'zod';

const UUID_CANONICAL_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createPaymentZodSchema = z
  .object({
    tenantAccountId: z
      .string()
      .regex(UUID_CANONICAL_REGEX, 'tenantAccountId must be a UUID'),
    amount: z.coerce
      .number()
      .min(0.01)
      .optional()
      .describe('Payment amount (required or auto-calculated from items)'),
    currencyCode: z
      .string()
      .min(1)
      .optional()
      .default('ARS')
      .describe('Currency code (default: ARS)'),
    paymentDate: z.string().date().describe('Date of payment (YYYY-MM-DD)'),
    method: z
      .nativeEnum(PaymentMethod)
      .describe(
        'cash|bank_transfer|credit_card|debit_card|check|digital_wallet|crypto|other',
      ),
    reference: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
    items: z
      .array(paymentItemZodSchema)
      .optional()
      .describe('Array of payment line items'),
  })
  .strict();

/**
 * DTO para crear un nuevo pago.
 */
export class CreatePaymentDto {
  static readonly zodSchema = createPaymentZodSchema;

  @Matches(UUID_CANONICAL_REGEX, {
    message: 'tenantAccountId must be a UUID',
  })
  @IsNotEmpty()
  tenantAccountId: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  currencyCode?: string = 'ARS';

  @IsDateString()
  @IsNotEmpty()
  paymentDate: string;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  method: PaymentMethod;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  @IsOptional()
  items?: PaymentItemDto[];
}
