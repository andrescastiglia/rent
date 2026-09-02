import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { DocumentType } from '../entities/document.entity';
import { z } from 'zod';

const generateUploadUrlZodSchema = z
  .object({
    entityType: z.enum([
      'property',
      'properties',
      'unit',
      'units',
      'lease',
      'leases',
      'tenant',
      'tenants',
      'owner',
      'owners',
      'maintenance',
      'maintenance_ticket',
    ]),
    entityId: z.uuid().describe('UUID of the parent entity'),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1),
    fileSize: z.coerce
      .number()
      .min(1)
      .max(10485760)
      .describe('File size in bytes (max 10MB)'),
    documentType: z
      .enum(DocumentType)
      .describe(
        'lease_contract|id_document|proof_of_income|bank_statement|utility_bill|insurance|inspection_report|maintenance_record|photo|other',
      ),
  })
  .strict();

export class GenerateUploadUrlDto {
  static readonly zodSchema = generateUploadUrlZodSchema;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'property',
    'properties',
    'unit',
    'units',
    'lease',
    'leases',
    'tenant',
    'tenants',
    'owner',
    'owners',
    'maintenance',
    'maintenance_ticket',
  ])
  entityType: string;

  @IsUUID()
  @IsNotEmpty()
  entityId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
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
