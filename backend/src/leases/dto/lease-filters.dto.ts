import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { LeaseStatus } from '../entities/lease.entity';

export class LeaseFiltersDto {
  @IsUUID()
  @IsOptional()
  unitId?: string;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsEnum(LeaseStatus)
  @IsOptional()
  status?: LeaseStatus;

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
