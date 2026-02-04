import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { Unit } from './entities/unit.entity';
import { PropertyFeature } from './entities/property-feature.entity';
import { PropertyVisit } from './entities/property-visit.entity';
import { PropertyVisitNotification } from './entities/property-visit-notification.entity';
import { Owner } from '../owners/entities/owner.entity';
import { PropertiesService } from './properties.service';
import { UnitsService } from './units.service';
import { PropertyVisitsService } from './property-visits.service';
import { PropertiesController } from './properties.controller';
import { UnitsController } from './units.controller';
import { PropertyVisitsController } from './property-visits.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Property,
      Unit,
      PropertyFeature,
      PropertyVisit,
      PropertyVisitNotification,
      Owner,
    ]),
  ],
  controllers: [PropertiesController, UnitsController, PropertyVisitsController],
  providers: [PropertiesService, UnitsService, PropertyVisitsService],
  exports: [TypeOrmModule, PropertiesService, UnitsService, PropertyVisitsService],
})
export class PropertiesModule {}
