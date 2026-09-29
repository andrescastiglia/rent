import { OmitType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CreateLeaseDto, createLeaseZodSchema } from './create-lease.dto';
import {
  ContractType,
  LeaseRenewalAlertPeriodicity,
  PaymentFrequency,
} from '../entities/lease.entity';

export class UpdateLeaseDto extends PartialType(
  OmitType(CreateLeaseDto, [
    'contractType',
    'currency',
    'paymentFrequency',
    'paymentDueDay',
    'renewalAlertEnabled',
    'renewalAlertPeriodicity',
  ] as const),
) {
  // A PATCH must not inject creation defaults for omitted fields, through HTTP or AI.
  static readonly zodSchema = createLeaseZodSchema
    .extend({
      contractType: createLeaseZodSchema.shape.contractType.removeDefault(),
      currency: createLeaseZodSchema.shape.currency.removeDefault(),
      paymentFrequency:
        createLeaseZodSchema.shape.paymentFrequency.removeDefault(),
      paymentDueDay: createLeaseZodSchema.shape.paymentDueDay.removeDefault(),
      renewalAlertEnabled:
        createLeaseZodSchema.shape.renewalAlertEnabled.removeDefault(),
      renewalAlertPeriodicity:
        createLeaseZodSchema.shape.renewalAlertPeriodicity.removeDefault(),
    })
    .partial()
    .strict();

  @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsEnum(PaymentFrequency) paymentFrequency?: PaymentFrequency;
  @IsOptional() @IsInt() @Min(1) @Max(31) paymentDueDay?: number;
  @IsOptional() @IsBoolean() renewalAlertEnabled?: boolean;
  @IsOptional()
  @IsEnum(LeaseRenewalAlertPeriodicity)
  renewalAlertPeriodicity?: LeaseRenewalAlertPeriodicity;
}
