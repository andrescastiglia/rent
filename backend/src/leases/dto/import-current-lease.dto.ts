import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ContractType } from '../entities/lease.entity';

export class ImportCurrentLeaseDto {
  @IsUUID()
  propertyId: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsEnum(ContractType)
  contractType: ContractType;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsUUID()
  @IsOptional()
  buyerId?: string;

  @IsUUID()
  @IsOptional()
  buyerProfileId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  monthlyRent?: string;

  @IsString()
  @IsOptional()
  fiscalValue?: string;

  @IsString()
  @IsOptional()
  securityDeposit?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
