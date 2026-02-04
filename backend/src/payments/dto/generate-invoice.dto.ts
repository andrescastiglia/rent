import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class GenerateInvoiceDto {
  @IsBoolean()
  @IsOptional()
  issue?: boolean;

  @IsBoolean()
  @IsOptional()
  applyLateFee?: boolean;

  @IsBoolean()
  @IsOptional()
  applyAdjustment?: boolean;

  @IsDateString()
  @IsOptional()
  periodStart?: string;

  @IsDateString()
  @IsOptional()
  periodEnd?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
