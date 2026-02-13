import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  InterestedActivityStatus,
  InterestedActivityType,
} from '../entities/interested-activity.entity';
import { z } from 'zod';

export const createInterestedActivityZodSchema = z
  .object({
    type: z.nativeEnum(InterestedActivityType),
    subject: z.string().max(200),
    body: z.string().optional(),
    dueAt: z.string().date().optional(),
    completedAt: z.string().date().optional(),
    templateName: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    propertyId: z.string().uuid().optional(),
    markReserved: z.coerce.boolean().optional(),
    status: z.nativeEnum(InterestedActivityStatus).optional(),
  })
  .strict();

export class CreateInterestedActivityDto {
  static readonly zodSchema = createInterestedActivityZodSchema;

  @IsEnum(InterestedActivityType)
  type: InterestedActivityType;

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

  @IsString()
  @IsOptional()
  templateName?: string;

  @IsObject()
  @IsOptional()
  @Type(() => Object)
  metadata?: Record<string, unknown>;

  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @IsBoolean()
  @IsOptional()
  markReserved?: boolean;

  @IsEnum(InterestedActivityStatus)
  @IsOptional()
  status?: InterestedActivityStatus;
}
