import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { z } from 'zod';

const sendWhatsappMessageZodSchema = z
  .object({
    to: z
      .string()
      .min(8)
      .max(32)
      .describe('Recipient WhatsApp phone number (international format)'),
    text: z.string().min(1).max(4096).describe('Message text (max 4096 chars)'),
    pdfUrl: z
      .string()
      .regex(/^db:\/\/document\/[0-9a-fA-F-]+$/)
      .max(200)
      .optional(),
  })
  .strict();

export class SendWhatsappMessageDto {
  static readonly zodSchema = sendWhatsappMessageZodSchema;

  @IsString()
  @MinLength(8)
  @MaxLength(32)
  to: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text: string;

  @IsOptional()
  @IsString()
  @Matches(/^db:\/\/document\/[0-9a-fA-F-]+$/)
  @MaxLength(200)
  pdfUrl?: string;
}
