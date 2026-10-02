import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { z } from 'zod';

const createPropertyMaintenanceTaskZodSchema = z
  .object({
    scheduledAt: z
      .union([z.iso.date(), z.iso.datetime({ offset: true })])
      .optional()
      .describe(
        'Civil scheduled date (YYYY-MM-DD) or ISO datetime with timezone',
      ),
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
