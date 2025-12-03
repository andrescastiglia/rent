import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentFrequency } from '../entities/lease.entity';

export class CreateLeaseDto {
  @IsUUID()
  @IsNotEmpty()
  unitId: string;

  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  rentAmount: number;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  deposit: number;

  @IsString()
  @IsOptional()
  currencyCode?: string = 'ARS';

  @IsEnum(PaymentFrequency)
  @IsOptional()
  paymentFrequency?: PaymentFrequency = PaymentFrequency.MONTHLY;

  @IsString()
  @IsOptional()
  renewalTerms?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
