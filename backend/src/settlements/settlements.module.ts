import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settlement } from './entities/settlement.entity';
import { Owner } from '../owners/entities/owner.entity';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Settlement, Owner])],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [TypeOrmModule, SettlementsService],
})
export class SettlementsModule {}
