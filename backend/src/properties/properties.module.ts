import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Property } from './entities/property.entity';
import { Unit } from './entities/unit.entity';
import { PropertyFeature } from './entities/property-feature.entity';
import { Owner } from '../owners/entities/owner.entity';
import { PropertiesService } from './properties.service';
import { UnitsService } from './units.service';
import { PropertiesController } from './properties.controller';
import { UnitsController } from './units.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Property, Unit, PropertyFeature, Owner])],
  controllers: [PropertiesController, UnitsController],
  providers: [PropertiesService, UnitsService],
  exports: [TypeOrmModule, PropertiesService, UnitsService],
})
export class PropertiesModule {}
