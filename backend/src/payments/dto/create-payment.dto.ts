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
import { PaymentItemDto } from './payment-item.dto';
import { Type } from 'class-transformer';

const UUID_CANONICAL_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DTO para crear un nuevo pago.
 */
export class CreatePaymentDto {
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
