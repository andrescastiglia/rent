import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Owner } from './entities/owner.entity';
import { OwnersService } from './owners.service';
import { OwnersController } from './owners.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Owner])],
  controllers: [OwnersController],
  providers: [OwnersService],
  exports: [TypeOrmModule, OwnersService],
})
export class OwnersModule {}
