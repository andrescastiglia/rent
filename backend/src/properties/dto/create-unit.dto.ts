import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { UnitStatus } from '../entities/unit.entity';

export class CreateUnitDto {
  @IsUUID()
  @IsNotEmpty()
  propertyId: string;

  @IsString()
  @IsNotEmpty()
  unitNumber: string;

  @IsInt()
  @IsOptional()
  floor?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  bedrooms?: number = 0;

  @IsInt()
  @Min(0)
  @IsOptional()
  bathrooms?: number = 0;

  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  areaSqm: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyRent?: number;

  @IsString()
  @IsOptional()
  currency?: string = 'ARS';

  @IsEnum(UnitStatus)
  @IsOptional()
  status?: UnitStatus = UnitStatus.AVAILABLE;

  @IsString()
  @IsOptional()
  description?: string;
}
