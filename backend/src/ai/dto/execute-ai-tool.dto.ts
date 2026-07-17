import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { z } from 'zod';

const executeAiToolZodSchema = z
  .object({
    toolName: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).optional().default({}),
    conversationId: z.uuid().optional(),
    confirmationId: z.uuid().optional(),
    confirm: z.boolean().optional().default(false),
  })
  .strict();

export class ExecuteAiToolDto {
  static readonly zodSchema = executeAiToolZodSchema;

  @IsString()
  @IsNotEmpty()
  toolName: string;

  @IsOptional()
  @IsObject()
  arguments?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsUUID()
  confirmationId?: string;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
