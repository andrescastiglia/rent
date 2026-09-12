import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { databaseTls } from './database-tls';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const isTest = configService.get<string>('NODE_ENV') === 'test';
  const databaseUrl = configService.get<string>('DATABASE_URL');

  return {
    type: 'postgres',
    ...(databaseUrl
      ? { url: databaseUrl }
      : {
          host: configService.get<string>('POSTGRES_HOST', 'localhost'),
          port: configService.get<number>('POSTGRES_PORT', 5432),
          username: configService.get<string>('POSTGRES_USER', 'rent_user'),
          password: configService.get<string>(
            'POSTGRES_PASSWORD',
            'rent_password',
          ),
          database: configService.get<string>('POSTGRES_DB', 'rent_db'),
        }),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    // Schema changes are always applied through reviewed SQL migrations.
    synchronize: false,
    ssl: databaseTls({
      DATABASE_SSL_MODE: configService.get<string>('DATABASE_SSL_MODE'),
      DATABASE_SSL_CA_FILE: configService.get<string>('DATABASE_SSL_CA_FILE'),
      DATABASE_URL: databaseUrl,
    }),
    logging: !isProduction && !isTest,
  };
};
