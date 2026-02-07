import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePropertyMaintenanceTaskDto {
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
