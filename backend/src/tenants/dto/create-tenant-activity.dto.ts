import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  TenantActivityStatus,
  TenantActivityType,
} from '../entities/tenant-activity.entity';

export class CreateTenantActivityDto {
  @IsEnum(TenantActivityType)
  type: TenantActivityType;

  @IsString()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @IsEnum(TenantActivityStatus)
  @IsOptional()
  status?: TenantActivityStatus;

  @IsObject()
  @IsOptional()
  @Type(() => Object)
  metadata?: Record<string, unknown>;
}
