import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Owner } from './entities/owner.entity';
import { OwnerActivity } from './entities/owner-activity.entity';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { Document } from '../documents/entities/document.entity';
import { OwnersService } from './owners.service';
import { OwnersController } from './owners.controller';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Owner, OwnerActivity, Property, User, Document]),
    DocumentsModule,
  ],
  controllers: [OwnersController],
  providers: [OwnersService],
  exports: [TypeOrmModule, OwnersService],
})
export class OwnersModule {}
