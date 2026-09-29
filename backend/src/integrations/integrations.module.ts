import { MercadoLibreOAuthClient } from './mercadolibre-oauth.client';
import { MercadoLibreConnectionsService } from './mercadolibre-connections.service';
import { ProviderTokenCipherService } from './provider-token-cipher.service';
import { MercadoLibreConnectionsController } from './mercadolibre-connections.controller';
import { MercadoLibreClient } from './mercadolibre.client';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProviderConfigService } from './provider-config.service';
import { ProviderHttpService } from './provider-http.service';
import { BfaClient } from './bfa.client';
import { MercadoPagoPayoutsClient } from './mercadopago-payouts.client';

@Module({
  imports: [ConfigModule],
  controllers: [MercadoLibreConnectionsController],
  providers: [
    ProviderConfigService,
    ProviderHttpService,
    BfaClient,
    MercadoPagoPayoutsClient,
    MercadoLibreClient,
    MercadoLibreOAuthClient,
    MercadoLibreConnectionsService,
    ProviderTokenCipherService,
  ],
  exports: [
    ProviderConfigService,
    BfaClient,
    MercadoPagoPayoutsClient,
    MercadoLibreClient,
    MercadoLibreOAuthClient,
    MercadoLibreConnectionsService,
    ProviderTokenCipherService,
  ],
})
export class IntegrationsModule {}
