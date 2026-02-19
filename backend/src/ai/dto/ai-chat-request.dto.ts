import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { z } from 'zod';

const aiChatMessageZodSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const aiChatRequestZodSchema = z
  .object({
    prompt: z.string().min(1),
    conversationId: z.string().uuid().optional(),
    messages: z.array(aiChatMessageZodSchema).optional(),
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
}
