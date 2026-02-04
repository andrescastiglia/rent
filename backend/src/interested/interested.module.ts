import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterestedProfile } from './entities/interested-profile.entity';
import { InterestedService } from './interested.service';
import { InterestedController } from './interested.controller';
import { Property } from '../properties/entities/property.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InterestedProfile, Property])],
  controllers: [InterestedController],
  providers: [InterestedService],
  exports: [InterestedService, TypeOrmModule],
})
export class InterestedModule {}
