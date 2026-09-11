import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { raw } from 'express';
import { DocumentContentController } from './document-content.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Document } from './entities/document.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Document]), ConfigModule],
  controllers: [DocumentsController, DocumentContentController],
  providers: [DocumentsService],
  exports: [DocumentsService, TypeOrmModule],
})
export class DocumentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(raw({ type: () => true, limit: '10mb' })).forRoutes({
      path: 'documents/:id/content',
      method: RequestMethod.PUT,
    });
  }
}
