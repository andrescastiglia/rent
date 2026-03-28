import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContractType } from '../entities/lease.entity';

export class ImportLeaseTemplateDocxDto {
  @IsEnum(ContractType)
  contractType: ContractType;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;
}
