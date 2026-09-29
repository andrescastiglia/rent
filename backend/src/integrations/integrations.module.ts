import { MercadoLibreClient } from './mercadolibre.client';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProviderConfigService } from './provider-config.service';
import { ProviderHttpService } from './provider-http.service';
import { BfaClient } from './bfa.client';
import { MercadoPagoPayoutsClient } from './mercadopago-payouts.client';

@Module({
  imports: [ConfigModule],
  providers: [
    ProviderConfigService,
    ProviderHttpService,
    BfaClient,
    MercadoPagoPayoutsClient,
    MercadoLibreClient,
  ],
  exports: [
    ProviderConfigService,
    BfaClient,
    MercadoPagoPayoutsClient,
    MercadoLibreClient,
  ],
})
export class IntegrationsModule {}
