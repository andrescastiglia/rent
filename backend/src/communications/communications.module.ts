import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { CommunicationDelivery } from './entities/communication-delivery.entity';
import { CommunicationTemplate } from './entities/communication-template.entity';

@Module({
  imports: [
    WhatsappModule,
    TypeOrmModule.forFeature([CommunicationTemplate, CommunicationDelivery]),
  ],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
  exports: [CommunicationsService, TypeOrmModule],
})
export class CommunicationsModule {}
