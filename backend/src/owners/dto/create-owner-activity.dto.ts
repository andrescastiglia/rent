import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  OwnerActivityStatus,
  OwnerActivityType,
} from '../entities/owner-activity.entity';
import { z } from 'zod';

export const createOwnerActivityZodSchema = z
  .object({
    type: z
      .nativeEnum(OwnerActivityType)
      .describe('call|task|note|email|whatsapp|visit|reserve'),
    subject: z.string().max(200),
    body: z.string().optional(),
    dueAt: z.string().date().optional().describe('Scheduled date (YYYY-MM-DD)'),
    completedAt: z
      .string()
      .date()
      .optional()
      .describe('Completion date (YYYY-MM-DD)'),
    status: z
      .nativeEnum(OwnerActivityStatus)
      .optional()
      .describe('pending|completed|cancelled'),
    propertyId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of related property (optional)'),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export class CreateOwnerActivityDto {
  static readonly zodSchema = createOwnerActivityZodSchema;

  @IsEnum(OwnerActivityType)
  type: OwnerActivityType;

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

  @IsEnum(OwnerActivityStatus)
  @IsOptional()
  status?: OwnerActivityStatus;

  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @IsObject()
  @IsOptional()
  @Type(() => Object)
  metadata?: Record<string, unknown>;
}
