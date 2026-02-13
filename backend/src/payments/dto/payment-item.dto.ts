import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaymentItemType } from '../entities/payment-item.entity';
import { Type } from 'class-transformer';
import { z } from 'zod';

export const paymentItemZodSchema = z
  .object({
    description: z.string().min(1),
    amount: z.coerce.number().min(0),
    quantity: z.coerce.number().int().min(1).optional().default(1),
    type: z
      .nativeEnum(PaymentItemType)
      .optional()
      .default(PaymentItemType.CHARGE),
  })
  .strict();

export class PaymentItemDto {
  static readonly zodSchema = paymentItemZodSchema;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  quantity?: number = 1;

  @IsEnum(PaymentItemType)
  @IsOptional()
  type?: PaymentItemType = PaymentItemType.CHARGE;
}
