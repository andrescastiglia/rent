import { IsNotEmpty, IsString } from 'class-validator';
import { z } from 'zod';

const whatsappWebhookQueryZodSchema = z
  .object({
    'hub.mode': z.string().min(1),
    'hub.verify_token': z.string().min(1),
    'hub.challenge': z.string().min(1),
  })
  .strict();

export class WhatsappWebhookQueryDto {
  static readonly zodSchema = whatsappWebhookQueryZodSchema;

  @IsString()
  @IsNotEmpty()
  ['hub.mode']: string;

  @IsString()
  @IsNotEmpty()
  ['hub.verify_token']: string;

  @IsString()
  @IsNotEmpty()
  ['hub.challenge']: string;
}
