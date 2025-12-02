import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  return {
    type: 'postgres',
    host: configService.get<string>('POSTGRES_HOST', 'localhost'),
    port: configService.get<number>('POSTGRES_PORT', 5432),
    username: configService.get<string>('POSTGRES_USER', 'rent_user'),
    password: configService.get<string>(
      'POSTGRES_PASSWORD',
      'rent_dev_password',
    ),
    database: configService.get<string>('POSTGRES_DB', 'rent_dev'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: false, // IMPORTANT: False because we use migrations
    logging: configService.get<string>('NODE_ENV') === 'development',
  };
};
