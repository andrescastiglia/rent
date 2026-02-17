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
    companyId: z.string().uuid().describe('UUID of the company'),
    propertyId: z.string().uuid().describe('UUID of the property being leased'),
    tenantId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of the tenant (for rental contracts)'),
    buyerProfileId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of the buyer profile (for sale contracts)'),
    ownerId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of the property owner'),
    templateId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of the contract template to use'),
    contractType: z
      .nativeEnum(ContractType)
      .optional()
      .default(ContractType.RENTAL),
    leaseNumber: z.string().min(1).optional(),
    startDate: z
      .string()
      .date()
      .optional()
      .describe('Lease start date (YYYY-MM-DD)'),
    endDate: z
      .string()
      .date()
      .optional()
      .describe('Lease end date (YYYY-MM-DD)'),
    monthlyRent: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Monthly rent amount'),
    fiscalValue: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Fiscal/stamp-tax value of the contract'),
    currency: z
      .string()
      .min(1)
      .optional()
      .default('ARS')
      .describe('Currency code (default: ARS)'),
    securityDeposit: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Security deposit amount'),
    paymentFrequency: z
      .nativeEnum(PaymentFrequency)
      .optional()
      .default(PaymentFrequency.MONTHLY),
    paymentDueDay: z.coerce
      .number()
      .optional()
      .default(10)
      .describe('Day of month rent is due (1-28)'),
    billingFrequency: z
      .nativeEnum(BillingFrequency)
      .optional()
      .describe('first_of_month|last_of_month|contract_date|custom'),
    billingDay: z.coerce
      .number()
      .optional()
      .describe('Day of month for billing'),
    lateFeeType: z
      .nativeEnum(LateFeeType)
      .optional()
      .describe('none|fixed|percentage|daily_fixed|daily_percentage'),
    lateFeeValue: z.coerce
      .number()
      .optional()
      .describe('Late fee amount or percentage value'),
    lateFeeGraceDays: z.coerce
      .number()
      .optional()
      .describe('Grace days before late fee applies'),
    lateFeeMax: z.coerce.number().optional().describe('Maximum late fee cap'),
    autoGenerateInvoices: z.coerce.boolean().optional(),
    adjustmentType: z
      .nativeEnum(AdjustmentType)
      .optional()
      .describe('fixed|percentage|inflation_index'),
    adjustmentValue: z.coerce
      .number()
      .optional()
      .describe('Adjustment amount or percentage'),
    adjustmentFrequencyMonths: z.coerce
      .number()
      .optional()
      .describe('Months between rent adjustments'),
    nextAdjustmentDate: z
      .string()
      .date()
      .optional()
      .describe('Next scheduled adjustment date (YYYY-MM-DD)'),
    inflationIndexType: z
      .nativeEnum(InflationIndexType)
      .optional()
      .describe('icl|ipc|igp_m'),
    increaseClauseType: z
      .nativeEnum(IncreaseClauseType)
      .optional()
      .describe(
        'none|annual_fixed|annual_percentage|inflation_linked|custom_schedule',
      ),
    increaseClauseValue: z.coerce
      .number()
      .optional()
      .describe('Increase clause value or percentage'),
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
