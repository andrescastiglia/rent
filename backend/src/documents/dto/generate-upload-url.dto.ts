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
    companyId: z.string().uuid(),
    entityType: z.string().min(1),
    entityId: z.string().uuid(),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    fileSize: z.coerce.number().min(1).max(10485760),
    documentType: z.nativeEnum(DocumentType),
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
