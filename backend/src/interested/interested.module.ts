import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterestedProfile } from './entities/interested-profile.entity';
import { InterestedService } from './interested.service';
import { InterestedController } from './interested.controller';
import { Property } from '../properties/entities/property.entity';
import { InterestedStageHistory } from './entities/interested-stage-history.entity';
import { InterestedActivity } from './entities/interested-activity.entity';
import { InterestedPropertyMatch } from './entities/interested-property-match.entity';
import { PropertyVisit } from '../properties/entities/property-visit.entity';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { SaleAgreement } from '../sales/entities/sale-agreement.entity';
import { SaleFolder } from '../sales/entities/sale-folder.entity';
import { PropertyReservation } from './entities/property-reservation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InterestedProfile,
      Property,
      InterestedStageHistory,
      InterestedActivity,
      InterestedPropertyMatch,
      PropertyReservation,
      PropertyVisit,
      User,
      Tenant,
      SaleAgreement,
      SaleFolder,
    ]),
  ],
  controllers: [InterestedController],
  providers: [InterestedService],
  exports: [InterestedService, TypeOrmModule],
})
export class InterestedModule {}
