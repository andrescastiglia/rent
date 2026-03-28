import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Buyer } from './entities/buyer.entity';
import { BuyersService } from './buyers.service';
import { BuyersController } from './buyers.controller';
import { User } from '../users/entities/user.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Buyer, User, InterestedProfile])],
  controllers: [BuyersController],
  providers: [BuyersService],
  exports: [BuyersService, TypeOrmModule],
})
export class BuyersModule {}
