import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lease } from './entities/lease.entity';
import { LeaseAmendment } from './entities/lease-amendment.entity';
import { Unit } from '../properties/entities/unit.entity';
import { LeasesService } from './leases.service';
import { AmendmentsService } from './amendments.service';
import { LeasesController } from './leases.controller';
import { AmendmentsController } from './amendments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Lease, LeaseAmendment, Unit])],
  controllers: [LeasesController, AmendmentsController],
  providers: [LeasesService, AmendmentsService],
  exports: [TypeOrmModule, LeasesService, AmendmentsService],
})
export class LeasesModule {}
