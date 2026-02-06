import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsObject,
  Min,
} from 'class-validator';
import {
  InterestedOperation,
  InterestedPropertyType,
  InterestedQualificationLevel,
  InterestedStatus,
} from '../entities/interested-profile.entity';
import { Type } from 'class-transformer';

export class CreateInterestedProfileDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  peopleCount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxAmount?: number;

  @IsBoolean()
  @IsOptional()
  hasPets?: boolean;

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  guaranteeTypes?: string[];

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  preferredZones?: string[];

  @IsString()
  @IsOptional()
  preferredCity?: string;

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  desiredFeatures?: string[];

  @IsEnum(InterestedPropertyType)
  @IsOptional()
  propertyTypePreference?: InterestedPropertyType;

  @IsEnum(InterestedOperation)
  @IsOptional()
  operation?: InterestedOperation;

  @IsEnum(InterestedStatus)
  @IsOptional()
  status?: InterestedStatus;

  @IsEnum(InterestedQualificationLevel)
  @IsOptional()
  qualificationLevel?: InterestedQualificationLevel;

  @IsString()
  @IsOptional()
  qualificationNotes?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsUUID()
  @IsOptional()
  assignedToUserId?: string;

  @IsString()
  @IsOptional()
  organizationName?: string;

  @IsObject()
  @IsOptional()
  customFields?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  consentContact?: boolean;

  @IsOptional()
  @Type(() => Date)
  consentRecordedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  lastContactAt?: Date;

  @IsOptional()
  @Type(() => Date)
  nextContactAt?: Date;

  @IsString()
  @IsOptional()
  lostReason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
