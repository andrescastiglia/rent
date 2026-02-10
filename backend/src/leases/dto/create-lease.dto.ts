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
import {
  ContractType,
  PaymentFrequency,
  BillingFrequency,
  LateFeeType,
  AdjustmentType,
  IncreaseClauseType,
  InflationIndexType,
} from '../entities/lease.entity';

export class CreateLeaseDto {
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsUUID()
  @IsNotEmpty()
  propertyId: string;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsUUID()
  @IsOptional()
  buyerProfileId?: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsEnum(ContractType)
  @IsOptional()
  contractType?: ContractType = ContractType.RENTAL;

  @IsString()
  @IsOptional()
  leaseNumber?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyRent?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  fiscalValue?: number;

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

  @IsNumber()
  @IsOptional()
  lateFeeMax?: number;

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

  @IsDateString()
  @IsOptional()
  nextAdjustmentDate?: string;

  @IsEnum(InflationIndexType)
  @IsOptional()
  inflationIndexType?: InflationIndexType;

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
