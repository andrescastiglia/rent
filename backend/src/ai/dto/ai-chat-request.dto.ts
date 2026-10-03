import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { z } from 'zod';

const aiChatMessageZodSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const aiChatRequestZodSchema = z
  .object({
    prompt: z.string().min(1),
    conversationId: z.uuid().optional(),
    messages: z.array(aiChatMessageZodSchema).optional(),
    channel: z.enum(['web', 'mobile']).optional(),
    currentPath: z
      .string()
      .max(300)
      .regex(/^\/(?:es|en|pt)(?:\/[a-zA-Z0-9/_-]*)?$/)
      .optional(),
  })
  .strict();

export type AiChatMessage = z.infer<typeof aiChatMessageZodSchema>;

export class AiChatRequestDto {
  static readonly zodSchema = aiChatRequestZodSchema;

  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsUUID()
  @IsOptional()
  conversationId?: string;

  @IsArray()
  @IsOptional()
  messages?: AiChatMessage[];

  @IsOptional()
  @IsIn(['web', 'mobile'])
  channel?: 'web' | 'mobile';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/(?:es|en|pt)(?:\/[a-zA-Z0-9/_-]*)?$/)
  currentPath?: string;
}
