import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ContractType } from '../entities/lease.entity';
import { z } from 'zod';

export const createLeaseContractTemplateZodSchema = z
  .object({
    name: z.string().min(1).max(120),
    contractType: z.enum(ContractType).describe('rental|sale'),
    templateFormat: z
      .enum(['plain_text', 'html'])
      .optional()
      .default('plain_text')
      .describe('plain_text|html'),
    templateBody: z
      .string()
      .min(1)
      .describe('HTML/text template body with {{placeholders}}'),
    isActive: z.coerce.boolean().optional(),
  })
  .strict();

export class CreateLeaseContractTemplateDto {
  static readonly zodSchema = createLeaseContractTemplateZodSchema;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEnum(ContractType)
  contractType: ContractType;

  @IsString()
  @IsOptional()
  templateFormat?: 'plain_text' | 'html';

  @IsString()
  @IsNotEmpty()
  templateBody: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
