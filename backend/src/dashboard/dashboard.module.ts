import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Property } from '../properties/entities/property.entity';
import { Lease } from '../leases/entities/lease.entity';
import { User } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../payments/entities/invoice.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Property, Lease, User, Payment, Invoice]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
