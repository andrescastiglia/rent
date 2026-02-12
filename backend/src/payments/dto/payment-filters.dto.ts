import {
  IsOptional,
  IsEnum,
  IsDateString,
  Matches,
} from 'class-validator';
import { PaymentStatus, PaymentMethod } from '../entities/payment.entity';

const UUID_CANONICAL_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PaymentFiltersDto {
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
