import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DigitalSignatureRequest } from './entities/digital-signature-request.entity';
import { Lease } from '../leases/entities/lease.entity';
import { DigitalSignaturesService } from './digital-signatures.service';
import { DigitalSignaturesController } from './digital-signatures.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DigitalSignatureRequest, Lease]),
    ConfigModule,
  ],
  controllers: [DigitalSignaturesController],
  providers: [DigitalSignaturesService],
  exports: [DigitalSignaturesService],
})
export class DigitalSignaturesModule {}
