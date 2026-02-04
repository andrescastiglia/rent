import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  InterestedOperation,
  InterestedPropertyType,
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
  maxAmount?: number;

  @IsBoolean()
  @IsOptional()
  hasPets?: boolean;

  @IsBoolean()
  @IsOptional()
  whiteIncome?: boolean;

  @IsString({ each: true })
  @IsOptional()
  guaranteeTypes?: string[];

  @IsEnum(InterestedPropertyType)
  @IsOptional()
  propertyTypePreference?: InterestedPropertyType;

  @IsEnum(InterestedOperation)
  @IsOptional()
  operation?: InterestedOperation;

  @IsString()
  @IsOptional()
  notes?: string;
}
