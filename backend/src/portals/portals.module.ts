import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalListing } from './entities/portal-listing.entity';
import { Property } from '../properties/entities/property.entity';
import { PortalsController } from './portals.controller';
import { PortalsService } from './portals.service';

@Module({
  imports: [TypeOrmModule.forFeature([PortalListing, Property])],
  controllers: [PortalsController],
  providers: [PortalsService],
  exports: [PortalsService],
})
export class PortalsModule {}
