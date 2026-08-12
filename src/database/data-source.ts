import 'dotenv/config';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 55432),
  database: process.env.DB_NAME ?? 'erp',
  username: process.env.DB_USER ?? 'erp',
  password: process.env.DB_PASS ?? 'erp',
  entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
  migrations: ['src/database/migrations/*.ts', 'dist/database/migrations/*.js'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
