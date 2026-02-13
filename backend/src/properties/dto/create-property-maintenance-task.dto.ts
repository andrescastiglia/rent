import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { z } from 'zod';

const createPropertyMaintenanceTaskZodSchema = z
  .object({
    scheduledAt: z.string().date().optional(),
    title: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict();

export class CreatePropertyMaintenanceTaskDto {
  static readonly zodSchema = createPropertyMaintenanceTaskZodSchema;

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
