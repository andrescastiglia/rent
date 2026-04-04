import { PartialType } from '@nestjs/mapped-types';
import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsString,
  IsNumber,
  Min,
} from 'class-validator';
import { CreateMaintenanceTicketDto } from './create-maintenance-ticket.dto';
import { MaintenanceTicketStatus } from '../entities/maintenance-ticket.entity';

export class UpdateMaintenanceTicketDto extends PartialType(
  CreateMaintenanceTicketDto,
) {
  @IsOptional()
  @IsEnum(MaintenanceTicketStatus)
  status?: MaintenanceTicketStatus;

  @IsOptional()
  @IsUUID()
  assignedToStaffId?: string;

  @IsOptional()
  @IsDateString()
  resolvedAt?: Date;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCost?: number;

  @IsOptional()
  @IsString()
  externalRef?: string;
}
