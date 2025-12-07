import { IsOptional, IsUUID, IsEnum, IsDateString } from 'class-validator';
import { PaymentStatus, PaymentMethod } from '../entities/payment.entity';

export class PaymentFiltersDto {
  @IsOptional()
  @IsUUID()
  tenantAccountId?: string;

  @IsOptional()
  @IsUUID()
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
