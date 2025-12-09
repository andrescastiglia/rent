import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { AmendmentChangeType } from '../entities/lease-amendment.entity';

export class CreateAmendmentDto {
  @IsUUID()
  @IsNotEmpty()
  leaseId: string;

  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsDateString()
  @IsNotEmpty()
  effectiveDate: string;

  @IsEnum(AmendmentChangeType)
  @IsNotEmpty()
  changeType: AmendmentChangeType;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  previousValues?: Record<string, any>;

  @IsOptional()
  newValues?: Record<string, any>;
}
