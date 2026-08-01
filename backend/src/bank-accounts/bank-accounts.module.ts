import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { Owner } from '../owners/entities/owner.entity';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccountsController } from './bank-accounts.controller';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, Owner, Property, User])],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [TypeOrmModule, BankAccountsService],
})
export class BankAccountsModule {}
