import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Owner } from './entities/owner.entity';
import { OwnerActivity } from './entities/owner-activity.entity';
import { Property } from '../properties/entities/property.entity';
import { OwnersService } from './owners.service';
import { OwnersController } from './owners.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Owner, OwnerActivity, Property])],
  controllers: [OwnersController],
  providers: [OwnersService],
  exports: [TypeOrmModule, OwnersService],
})
export class OwnersModule {}
