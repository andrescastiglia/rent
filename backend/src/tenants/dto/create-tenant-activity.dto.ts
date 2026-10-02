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
      .enum(TenantActivityType)
      .describe('call|task|note|email|whatsapp|visit'),
    subject: z.string().max(200),
    body: z.string().optional(),
    dueAt: z
      .union([z.iso.date(), z.iso.datetime({ offset: true })])
      .optional()
      .describe(
        'Civil scheduled date (YYYY-MM-DD) or ISO datetime with timezone',
      ),
    completedAt: z
      .union([z.iso.date(), z.iso.datetime({ offset: true })])
      .optional()
      .describe(
        'Civil completion date (YYYY-MM-DD) or ISO datetime with timezone',
      ),
    status: z
      .enum(TenantActivityStatus)
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
