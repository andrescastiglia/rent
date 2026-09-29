import { SettlementPayoutsService } from './settlement-payouts.service';
import { SettlementPayoutsController } from './settlement-payouts.controller';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CommunicationsModule } from '../communications/communications.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settlement } from './entities/settlement.entity';
import { Owner } from '../owners/entities/owner.entity';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';

@Module({
  imports: [
    IntegrationsModule,
    CommunicationsModule,
    TypeOrmModule.forFeature([Settlement, Owner]),
  ],
  controllers: [SettlementsController, SettlementPayoutsController],
  providers: [SettlementsService, SettlementPayoutsService],
  exports: [TypeOrmModule, SettlementsService],
})
export class SettlementsModule {}
