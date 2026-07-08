import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class PostgresExtensionsService implements OnApplicationBootstrap {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') {
      return;
    }

    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS unaccent');
  }
}
