import { SettlementPayoutEffectsService } from './settlement-payout-effects.service';
import { SettlementCalculationController } from './settlement-calculation.controller';
import { SettlementCalculationService } from './settlement-calculation.service';
import { SettlementGenerationController } from './settlement-generation.controller';
import { SettlementGenerationService } from './settlement-generation.service';
import { SettlementPayoutReceiptPdfService } from './settlement-payout-receipt-pdf.service';
import { SettlementPayoutReceiptsController } from './settlement-payout-receipts.controller';
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
  controllers: [
    SettlementGenerationController,
    SettlementCalculationController,
    SettlementsController,
    SettlementPayoutsController,
    SettlementPayoutReceiptsController,
  ],
  providers: [
    SettlementGenerationService,
    SettlementCalculationService,
    SettlementsService,
    SettlementPayoutsService,
    SettlementPayoutEffectsService,
    SettlementPayoutReceiptPdfService,
  ],
  exports: [TypeOrmModule, SettlementsService],
})
export class SettlementsModule {}
