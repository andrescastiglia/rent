import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Tenant } from './entities/tenant.entity';
import { TenantActivity } from './entities/tenant-activity.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { TenantAccount } from '../payments/entities/tenant-account.entity';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      TenantActivity,
      User,
      Lease,
      Invoice,
      TenantAccount,
    ]),
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TypeOrmModule, TenantsService],
})
export class TenantsModule {}
