import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { SettlementStatus } from '../entities/settlement.entity';

export class SettlementFiltersDto {
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsEnum(SettlementStatus)
  @IsOptional()
  status?: SettlementStatus;

  @IsISO8601()
  @IsOptional()
  periodStart?: string;

  @IsISO8601()
  @IsOptional()
  periodEnd?: string;
}
