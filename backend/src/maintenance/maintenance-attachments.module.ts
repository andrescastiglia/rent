import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { MaintenanceAttachmentsController } from './maintenance-attachments.controller';
import { MaintenanceAttachmentsService } from './maintenance-attachments.service';

@Module({
  imports: [DocumentsModule],
  controllers: [MaintenanceAttachmentsController],
  providers: [MaintenanceAttachmentsService],
})
export class MaintenanceAttachmentsModule {}
