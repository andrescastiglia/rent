import { IsNotEmpty, IsString } from 'class-validator';
import { z } from 'zod';

const whatsappWebhookQueryZodSchema = z
  .object({
    'hub.mode': z.string().min(1).optional(),
    'hub.verify_token': z.string().min(1).optional(),
    'hub.challenge': z.string().min(1).optional(),
    hub_mode: z.string().min(1).optional(),
    hub_verify_token: z.string().min(1).optional(),
    hub_challenge: z.string().min(1).optional(),
  })
  .strict()
  .transform((query, ctx) => {
    const mode = query['hub.mode'] ?? query.hub_mode;
    const verifyToken = query['hub.verify_token'] ?? query.hub_verify_token;
    const challenge = query['hub.challenge'] ?? query.hub_challenge;

    for (const [key, value] of [
      ['hub.mode', mode],
      ['hub.verify_token', verifyToken],
      ['hub.challenge', challenge],
    ] as const) {
      if (!value) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Required',
        });
      }
    }

    return {
      'hub.mode': mode,
      'hub.verify_token': verifyToken,
      'hub.challenge': challenge,
    };
  });

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
