import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { AmendmentChangeType } from '../entities/lease-amendment.entity';

export class CreateAmendmentDto {
  @IsUUID()
  @IsNotEmpty()
  leaseId: string;

  @IsDateString()
  @IsNotEmpty()
  effectiveDate: string;

  @IsEnum(AmendmentChangeType)
  @IsNotEmpty()
  changeType: AmendmentChangeType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  oldValues?: Record<string, any>;

  @IsOptional()
  newValues?: Record<string, any>;
}
