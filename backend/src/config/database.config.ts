import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
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
            'rent_dev_password',
          ),
          database: configService.get<string>('POSTGRES_DB', 'rent_dev'),
        }),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    // Synchronize creates/updates tables automatically
    // Use TYPEORM_SYNC=true in .env to enable (useful for initial setup)
    synchronize: configService.get<string>('TYPEORM_SYNC', 'false') === 'true',
    logging: !isProduction,
  };
};
