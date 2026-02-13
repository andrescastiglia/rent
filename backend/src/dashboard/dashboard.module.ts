import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Property } from '../properties/entities/property.entity';
import { Lease } from '../leases/entities/lease.entity';
import { User } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { BillingJob } from '../payments/entities/billing-job.entity';
import { CommissionInvoice } from '../payments/entities/commission-invoice.entity';
import { InterestedActivity } from '../interested/entities/interested-activity.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';
import { OwnerActivity } from '../owners/entities/owner-activity.entity';
import { Owner } from '../owners/entities/owner.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Property,
      Lease,
      User,
      Payment,
      Invoice,
      BillingJob,
      CommissionInvoice,
      InterestedActivity,
      InterestedProfile,
      OwnerActivity,
      Owner,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
