import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';
import { logger } from './logger';

/**
 * TypeORM DataSource configuration for batch processing.
 * Shares the same database as the backend.
 */
const dataSourceOptions: DataSourceOptions = {
    type: 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'rent_user',
    password: process.env.POSTGRES_PASSWORD || 'rent_dev_password',
    database: process.env.POSTGRES_DB || 'rent_dev',
    entities: [
        path.join(__dirname, '../../backend/src/**/entities/*.entity.{ts,js}'),
        path.join(__dirname, './entities/*.entity.{ts,js}'),
    ],
    synchronize: false, // Never auto-sync in production
    logging: process.env.LOG_LEVEL === 'debug',
    ssl:
        process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
};

export const AppDataSource = new DataSource(dataSourceOptions);

/**
 * Initialize database connection.
 * @returns Promise that resolves when connection is established.
 */
export async function initializeDatabase(): Promise<DataSource> {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
            logger.info('Database connection established');
        }
        return AppDataSource;
    } catch (error) {
        logger.error('Failed to connect to database', { error });
        throw error;
    }
}

/**
 * Close database connection gracefully.
 */
export async function closeDatabase(): Promise<void> {
    try {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
            logger.info('Database connection closed');
        }
    } catch (error) {
        logger.error('Failed to close database connection', { error });
        throw error;
    }
}
