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

export class GenerateUploadUrlDto {
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
