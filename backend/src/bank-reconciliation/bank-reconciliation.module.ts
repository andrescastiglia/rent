import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { PaymentsModule } from '../payments/payments.module';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankReconciliation } from './entities/bank-reconciliation.entity';
import { BankReconciliationAlert } from './entities/bank-reconciliation-alert.entity';
import { BankMovement } from './entities/bank-movement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankMovement,
      BankReconciliation,
      BankReconciliationAlert,
      BankAccount,
      Invoice,
    ]),
    PaymentsModule,
  ],
  controllers: [BankReconciliationController],
  providers: [BankReconciliationService],
  exports: [BankReconciliationService],
})
export class BankReconciliationModule {}
