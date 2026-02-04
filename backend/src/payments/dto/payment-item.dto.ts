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

export class PaymentItemDto {
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
