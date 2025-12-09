import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  Min,
} from 'class-validator';
import { UnitStatus } from '../entities/unit.entity';

export class CreateUnitDto {
  @IsUUID()
  @IsNotEmpty()
  propertyId: string;

  @IsUUID()
  @IsOptional()
  companyId?: string;

  @IsString()
  @IsNotEmpty()
  unitNumber: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  bedrooms?: number = 0;

  @IsNumber()
  @Min(0)
  @IsOptional()
  bathrooms?: number = 0;

  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  area: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseRent?: number;

  @IsString()
  @IsOptional()
  currency?: string = 'ARS';

  @IsString()
  @IsOptional()
  unitType?: string;

  @IsBoolean()
  @IsOptional()
  hasParking?: boolean = false;

  @IsInt()
  @IsOptional()
  parkingSpots?: number = 0;

  @IsBoolean()
  @IsOptional()
  hasStorage?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isFurnished?: boolean = false;

  @IsNumber()
  @IsOptional()
  expenses?: number;

  @IsEnum(UnitStatus)
  @IsOptional()
  status?: UnitStatus = UnitStatus.AVAILABLE;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
