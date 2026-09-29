import { IntegrationsModule } from '../integrations/integrations.module';
import { CommunicationsModule } from '../communications/communications.module';
import { PortalPublicationOutboxService } from './portal-publication-outbox.service';
import { PortalPublicationController } from './portal-publication.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalListing } from './entities/portal-listing.entity';
import { Property } from '../properties/entities/property.entity';
import { PortalsController } from './portals.controller';
import { PortalsService } from './portals.service';

@Module({
  imports: [
    IntegrationsModule,
    CommunicationsModule,
    TypeOrmModule.forFeature([PortalListing, Property]),
  ],
  controllers: [PortalsController, PortalPublicationController],
  providers: [PortalsService, PortalPublicationOutboxService],
  exports: [PortalsService],
})
export class PortalsModule {}
