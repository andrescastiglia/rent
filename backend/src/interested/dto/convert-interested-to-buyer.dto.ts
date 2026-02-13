import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { z } from 'zod';

const convertInterestedToBuyerZodSchema = z
  .object({
    folderId: z.string().uuid(),
    totalAmount: z.coerce.number().min(1),
    installmentAmount: z.coerce.number().min(1),
    installmentCount: z.coerce.number().min(1),
    startDate: z.string().date(),
    currency: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export class ConvertInterestedToBuyerDto {
  static readonly zodSchema = convertInterestedToBuyerZodSchema;

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
