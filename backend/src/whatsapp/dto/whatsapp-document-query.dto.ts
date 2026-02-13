import { IsNotEmpty, IsString } from 'class-validator';
import { z } from 'zod';

const whatsappDocumentQueryZodSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

export class WhatsappDocumentQueryDto {
  static readonly zodSchema = whatsappDocumentQueryZodSchema;

  @IsString()
  @IsNotEmpty()
  token: string;
}
