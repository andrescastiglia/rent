import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * DTO para crear una nueva factura.
 */
export class CreateInvoiceDto {
  @IsUUID()
  @IsNotEmpty()
  leaseId: string;

  @IsDateString()
  @IsNotEmpty()
  periodStart: string;

  @IsDateString()
  @IsNotEmpty()
  periodEnd: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  subtotal: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  lateFee?: number = 0;

  @IsNumber()
  @IsOptional()
  adjustments?: number = 0;

  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
