import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import {
  MaintenanceTicketArea,
  MaintenanceTicketPriority,
  MaintenanceTicketSource,
} from '../entities/maintenance-ticket.entity';

export class CreateMaintenanceTicketDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  propertyId: string;

  @IsOptional()
  @IsEnum(MaintenanceTicketArea)
  area?: MaintenanceTicketArea;

  @IsOptional()
  @IsEnum(MaintenanceTicketPriority)
  priority?: MaintenanceTicketPriority;

  @IsOptional()
  @IsEnum(MaintenanceTicketSource)
  source?: MaintenanceTicketSource;

  @IsOptional()
  @IsDateString()
  scheduledAt?: Date;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsString()
  costCurrency?: string;
}
