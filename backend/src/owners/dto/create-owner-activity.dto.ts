import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  OwnerActivityStatus,
  OwnerActivityType,
} from '../entities/owner-activity.entity';

export class CreateOwnerActivityDto {
  @IsEnum(OwnerActivityType)
  type: OwnerActivityType;

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

  @IsEnum(OwnerActivityStatus)
  @IsOptional()
  status?: OwnerActivityStatus;

  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @IsObject()
  @IsOptional()
  @Type(() => Object)
  metadata?: Record<string, unknown>;
}
