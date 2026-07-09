import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
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
    templateName: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9_]+$/)
      .optional(),
    templateLanguage: z
      .string()
      .regex(/^[a-z]{2}(_[A-Z]{2})?$/)
      .optional(),
    templateParameters: z.array(z.string().max(1024)).max(20).optional(),
    activityEntity: z.enum(['tenant', 'owner', 'interested']).optional(),
    activityId: z.string().uuid().optional(),
    relatedEntityType: z
      .enum([
        'tenant',
        'owner',
        'interested',
        'property_visit',
        'invoice',
        'payment',
        'lease',
      ])
      .optional(),
    relatedEntityId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
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

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  @MaxLength(120)
  templateName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(_[A-Z]{2})?$/)
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  templateParameters?: string[];

  @IsOptional()
  @IsIn(['tenant', 'owner', 'interested'])
  activityEntity?: 'tenant' | 'owner' | 'interested';

  @IsOptional()
  @IsUUID()
  activityId?: string;

  @IsOptional()
  @IsIn([
    'tenant',
    'owner',
    'interested',
    'property_visit',
    'invoice',
    'payment',
    'lease',
  ])
  relatedEntityType?:
    | 'tenant'
    | 'owner'
    | 'interested'
    | 'property_visit'
    | 'invoice'
    | 'payment'
    | 'lease';

  @IsOptional()
  @IsUUID()
  relatedEntityId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}
