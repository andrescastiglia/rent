import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleAgreementDto {
  @IsString()
  @IsNotEmpty()
  folderId: string;

  @IsString()
  @IsNotEmpty()
  buyerName: string;

  @IsString()
  @IsNotEmpty()
  buyerPhone: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  totalAmount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  installmentAmount: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  installmentCount: number;

  @IsDateString()
  startDate: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  dueDay?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
