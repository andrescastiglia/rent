import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lease } from './entities/lease.entity';
import { LeaseAmendment } from './entities/lease-amendment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lease, LeaseAmendment])],
  exports: [TypeOrmModule],
})
export class LeasesModule {}
