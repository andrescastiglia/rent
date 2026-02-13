import { IsNotEmpty, IsString } from 'class-validator';
import { z } from 'zod';

const aiChatRequestZodSchema = z
  .object({
    prompt: z.string().min(1),
  })
  .strict();

export class AiChatRequestDto {
  static readonly zodSchema = aiChatRequestZodSchema;

  @IsString()
  @IsNotEmpty()
  prompt: string;
}
