import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { DocumentType } from '../entities/document.entity';
import { z } from 'zod';

const generateUploadUrlZodSchema = z
  .object({
    companyId: z.string().uuid().describe('UUID of the company'),
    entityType: z
      .string()
      .min(1)
      .describe('Entity type the document belongs to (e.g. lease, tenant)'),
    entityId: z.string().uuid().describe('UUID of the parent entity'),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    fileSize: z.coerce
      .number()
      .min(1)
      .max(10485760)
      .describe('File size in bytes (max 10MB)'),
    documentType: z
      .nativeEnum(DocumentType)
      .describe(
        'lease_contract|id_document|proof_of_income|bank_statement|utility_bill|insurance|inspection_report|maintenance_record|photo|other',
      ),
  })
  .strict();

export class GenerateUploadUrlDto {
  static readonly zodSchema = generateUploadUrlZodSchema;

  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  entityType: string;

  @IsUUID()
  @IsNotEmpty()
  entityId: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  @Min(1)
  @Max(10485760) // 10MB max
  @IsNotEmpty()
  fileSize: number;

  @IsEnum(DocumentType)
  @IsNotEmpty()
  documentType: DocumentType;
}
