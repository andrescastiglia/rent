import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PaymentGatewayTransaction } from './entities/payment-gateway-transaction.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentGatewayController } from './payment-gateway.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentGatewayTransaction, Invoice]),
    HttpModule,
    ConfigModule,
  ],
  controllers: [PaymentGatewayController],
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
