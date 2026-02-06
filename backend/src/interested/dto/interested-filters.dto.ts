import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  InterestedOperation,
  InterestedPropertyType,
  InterestedQualificationLevel,
  InterestedStatus,
} from '../entities/interested-profile.entity';

export class InterestedFiltersDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(InterestedOperation)
  @IsOptional()
  operation?: InterestedOperation;

  @IsEnum(InterestedPropertyType)
  @IsOptional()
  propertyTypePreference?: InterestedPropertyType;

  @IsEnum(InterestedStatus)
  @IsOptional()
  status?: InterestedStatus;

  @IsEnum(InterestedQualificationLevel)
  @IsOptional()
  qualificationLevel?: InterestedQualificationLevel;

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
