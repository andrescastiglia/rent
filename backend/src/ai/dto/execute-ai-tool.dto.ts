import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { z } from 'zod';

const executeAiToolZodSchema = z
  .object({
    toolName: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).optional().default({}),
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
}
