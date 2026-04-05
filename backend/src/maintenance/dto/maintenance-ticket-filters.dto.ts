import { IsOptional, IsEnum, IsUUID, IsString } from 'class-validator';
import {
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
} from '../entities/maintenance-ticket.entity';

export class MaintenanceTicketFiltersDto {
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsEnum(MaintenanceTicketStatus)
  status?: MaintenanceTicketStatus;

  @IsOptional()
  @IsEnum(MaintenanceTicketPriority)
  priority?: MaintenanceTicketPriority;

  @IsOptional()
  @IsUUID()
  assignedToStaffId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
