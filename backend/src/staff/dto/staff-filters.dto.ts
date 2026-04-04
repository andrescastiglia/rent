import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StaffSpecialization } from '../entities/staff.entity';

export class StaffFiltersDto {
  @IsEnum(StaffSpecialization)
  @IsOptional()
  specialization?: StaffSpecialization;

  @IsString()
  @IsOptional()
  search?: string;
}
