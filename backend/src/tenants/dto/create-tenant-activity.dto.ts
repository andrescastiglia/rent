import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  TenantActivityStatus,
  TenantActivityType,
} from '../entities/tenant-activity.entity';
import { z } from 'zod';

export const createTenantActivityZodSchema = z
  .object({
    type: z
      .nativeEnum(TenantActivityType)
      .describe('call|task|note|email|whatsapp|visit'),
    subject: z.string().max(200),
    body: z.string().optional(),
    dueAt: z.string().date().optional().describe('Scheduled date (YYYY-MM-DD)'),
    completedAt: z
      .string()
      .date()
      .optional()
      .describe('Completion date (YYYY-MM-DD)'),
    status: z
      .nativeEnum(TenantActivityStatus)
      .optional()
      .describe('pending|completed|cancelled'),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export class CreateTenantActivityDto {
  static readonly zodSchema = createTenantActivityZodSchema;

  @IsEnum(TenantActivityType)
  type: TenantActivityType;

  @IsString()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @IsEnum(TenantActivityStatus)
  @IsOptional()
  status?: TenantActivityStatus;

  @IsObject()
  @IsOptional()
  @Type(() => Object)
  metadata?: Record<string, unknown>;
}
