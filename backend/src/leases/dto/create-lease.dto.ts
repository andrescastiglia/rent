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
import { z } from 'zod';

export const createLeaseZodSchema = z
  .object({
    companyId: z.string().uuid(),
    propertyId: z.string().uuid(),
    tenantId: z.string().uuid().optional(),
    buyerProfileId: z.string().uuid().optional(),
    ownerId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    contractType: z
      .nativeEnum(ContractType)
      .optional()
      .default(ContractType.RENTAL),
    leaseNumber: z.string().min(1).optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    monthlyRent: z.coerce.number().min(0).optional(),
    fiscalValue: z.coerce.number().min(0).optional(),
    currency: z.string().min(1).optional().default('ARS'),
    securityDeposit: z.coerce.number().min(0).optional(),
    paymentFrequency: z
      .nativeEnum(PaymentFrequency)
      .optional()
      .default(PaymentFrequency.MONTHLY),
    paymentDueDay: z.coerce.number().optional().default(10),
    billingFrequency: z.nativeEnum(BillingFrequency).optional(),
    billingDay: z.coerce.number().optional(),
    lateFeeType: z.nativeEnum(LateFeeType).optional(),
    lateFeeValue: z.coerce.number().optional(),
    lateFeeGraceDays: z.coerce.number().optional(),
    lateFeeMax: z.coerce.number().optional(),
    autoGenerateInvoices: z.coerce.boolean().optional(),
    adjustmentType: z.nativeEnum(AdjustmentType).optional(),
    adjustmentValue: z.coerce.number().optional(),
    adjustmentFrequencyMonths: z.coerce.number().optional(),
    nextAdjustmentDate: z.string().date().optional(),
    inflationIndexType: z.nativeEnum(InflationIndexType).optional(),
    increaseClauseType: z.nativeEnum(IncreaseClauseType).optional(),
    increaseClauseValue: z.coerce.number().optional(),
    termsAndConditions: z.string().min(1).optional(),
    specialClauses: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
  })
  .strict();

export class CreateLeaseDto {
  static readonly zodSchema = createLeaseZodSchema;

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

  @IsUUID()
  @IsOptional()
  templateId?: string;

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
