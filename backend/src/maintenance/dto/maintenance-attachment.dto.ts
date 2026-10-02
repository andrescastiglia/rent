import { PickType } from '@nestjs/mapped-types';
import { z } from 'zod';
import { GenerateUploadUrlDto } from '../../documents/dto/generate-upload-url.dto';
import { DocumentType } from '../../documents/entities/document.entity';

export class MaintenanceAttachmentDto extends PickType(GenerateUploadUrlDto, [
  'fileName',
  'mimeType',
  'fileSize',
  'documentType',
] as const) {
  static readonly zodSchema = GenerateUploadUrlDto.zodSchema
    .omit({ entityType: true, entityId: true })
    .extend({
      documentType: z.enum([
        DocumentType.MAINTENANCE_RECORD,
        DocumentType.PHOTO,
        DocumentType.OTHER,
      ]),
    })
    .strict();
}
