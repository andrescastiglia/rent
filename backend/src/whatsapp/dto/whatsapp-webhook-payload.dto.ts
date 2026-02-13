import { z } from 'zod';

const whatsappWebhookPayloadZodSchema = z.unknown();

export class WhatsappWebhookPayloadDto {
  static readonly zodSchema = whatsappWebhookPayloadZodSchema;
}
