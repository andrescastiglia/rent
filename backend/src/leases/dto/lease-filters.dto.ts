import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContractType, LeaseStatus } from '../entities/lease.entity';

export class LeaseFiltersDto {
  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsUUID()
  @IsOptional()
  buyerProfileId?: string;

  @IsEnum(LeaseStatus)
  @IsOptional()
  status?: LeaseStatus;

  @IsEnum(ContractType)
  @IsOptional()
  contractType?: ContractType;

  @IsString()
  @IsOptional()
  propertyAddress?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;
}
