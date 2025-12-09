import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentFrequency, BillingFrequency, LateFeeType, AdjustmentType, IncreaseClauseType } from '../entities/lease.entity';

export class CreateLeaseDto {
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsUUID()
  @IsNotEmpty()
  unitId: string;

  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @IsUUID()
  @IsNotEmpty()
  ownerId: string;

  @IsString()
  @IsOptional()
  leaseNumber?: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  monthlyRent: number;

  @IsString()
  @IsOptional()
  currency?: string = 'ARS';

  @IsNumber()
  @Min(0)
  @IsOptional()
  securityDeposit?: number;

  @IsEnum(PaymentFrequency)
  @IsOptional()
  paymentFrequency?: PaymentFrequency = PaymentFrequency.MONTHLY;

  @IsNumber()
  @IsOptional()
  paymentDueDay?: number = 10;

  @IsEnum(BillingFrequency)
  @IsOptional()
  billingFrequency?: BillingFrequency;

  @IsNumber()
  @IsOptional()
  billingDay?: number;

  @IsEnum(LateFeeType)
  @IsOptional()
  lateFeeType?: LateFeeType;

  @IsNumber()
  @IsOptional()
  lateFeeValue?: number;

  @IsNumber()
  @IsOptional()
  lateFeeGraceDays?: number;

  @IsBoolean()
  @IsOptional()
  autoGenerateInvoices?: boolean;

  @IsEnum(AdjustmentType)
  @IsOptional()
  adjustmentType?: AdjustmentType;

  @IsNumber()
  @IsOptional()
  adjustmentValue?: number;

  @IsNumber()
  @IsOptional()
  adjustmentFrequencyMonths?: number;

  @IsEnum(IncreaseClauseType)
  @IsOptional()
  increaseClauseType?: IncreaseClauseType;

  @IsNumber()
  @IsOptional()
  increaseClauseValue?: number;

  @IsString()
  @IsOptional()
  termsAndConditions?: string;

  @IsString()
  @IsOptional()
  specialClauses?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
