import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ConvertInterestedToBuyerDto {
  @IsUUID()
  folderId: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  totalAmount: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  installmentAmount: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  installmentCount: number;

  @IsDateString()
  startDate: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
