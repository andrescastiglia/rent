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
  InterestedActivityStatus,
  InterestedActivityType,
} from '../entities/interested-activity.entity';

export class CreateInterestedActivityDto {
  @IsEnum(InterestedActivityType)
  type: InterestedActivityType;

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

  @IsString()
  @IsOptional()
  templateName?: string;

  @IsObject()
  @IsOptional()
  @Type(() => Object)
  metadata?: Record<string, unknown>;

  @IsEnum(InterestedActivityStatus)
  @IsOptional()
  status?: InterestedActivityStatus;
}
