import { OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { z } from 'zod';
import { PaymentActivityType } from '../entities/payment.entity';
import { CreatePaymentDto, createPaymentZodSchema } from './create-payment.dto';

export class UpdatePaymentDto extends PartialType(
  OmitType(CreatePaymentDto, ['currencyCode', 'activityType'] as const),
) {
  // PATCH must not inherit the creation defaults when fields are omitted.
  static readonly zodSchema = createPaymentZodSchema
    .extend({
      currencyCode: z.string().min(1).optional(),
      activityType: z.enum(PaymentActivityType).optional(),
    })
    .partial()
    .strict();

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsEnum(PaymentActivityType)
  activityType?: PaymentActivityType;
}
