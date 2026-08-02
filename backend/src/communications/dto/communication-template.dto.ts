import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { z } from 'zod';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
} from '../entities/communication-template.entity';

export const communicationTemplateSchema = z
  .object({
    name: z.string().min(1).max(120),
    event: z.enum(CommunicationEvent),
    recipientRole: z.enum(CommunicationRecipientRole),
    channel: z.enum(CommunicationChannel),
    locale: z.string().min(2).max(10).default('es'),
    subject: z.string().max(200).nullable().optional(),
    body: z.string().min(1).max(10000),
    isActive: z.coerce.boolean().optional(),
    autoSend: z.coerce.boolean().optional(),
    requiresApproval: z.coerce.boolean().optional(),
    variables: z.array(z.string().max(80)).max(50).optional(),
  })
  .strict();

export class CreateCommunicationTemplateDto {
  static readonly zodSchema = communicationTemplateSchema;
  @IsString() @MaxLength(120) name: string;
  @IsEnum(CommunicationEvent) event: CommunicationEvent;
  @IsEnum(CommunicationRecipientRole) recipientRole: CommunicationRecipientRole;
  @IsEnum(CommunicationChannel) channel: CommunicationChannel;
  @IsString() @MaxLength(10) locale: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string | null;
  @IsString() body: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() autoSend?: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) variables?: string[];
}

export class UpdateCommunicationTemplateDto {
  static readonly zodSchema = communicationTemplateSchema.partial().strict();
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(CommunicationEvent) event?: CommunicationEvent;
  @IsOptional()
  @IsEnum(CommunicationRecipientRole)
  recipientRole?: CommunicationRecipientRole;
  @IsOptional() @IsEnum(CommunicationChannel) channel?: CommunicationChannel;
  @IsOptional() @IsString() @MaxLength(10) locale?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string | null;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() autoSend?: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) variables?: string[];
}

const variablesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
const previewSchema = z
  .object({
    templateId: z.uuid().optional(),
    subject: z.string().max(200).optional(),
    body: z.string().max(10000).optional(),
    variables: variablesSchema,
  })
  .strict()
  .refine((value) => value.templateId || value.body, {
    message: 'templateId or body is required',
  });

export class PreviewCommunicationDto {
  static readonly zodSchema = previewSchema;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
  @IsObject() variables: Record<string, string | number | boolean | null>;
}

export class TestCommunicationDto extends PreviewCommunicationDto {
  static readonly zodSchema = z
    .object({
      templateId: z.uuid().optional(),
      subject: z.string().max(200).optional(),
      body: z.string().max(10000).optional(),
      variables: variablesSchema,
      channel: z.enum(CommunicationChannel),
      recipient: z.string().min(3).max(320),
    })
    .strict()
    .refine((value) => value.templateId || value.body, {
      message: 'templateId or body is required',
    });
  @IsEnum(CommunicationChannel) channel: CommunicationChannel;
  @IsString() @MaxLength(320) recipient: string;
}
