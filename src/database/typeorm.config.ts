import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 55432),
  database: process.env.DB_NAME ?? 'erp',
  username: process.env.DB_USER ?? 'erp',
  password: process.env.DB_PASS ?? 'erp',
  autoLoadEntities: true,
  synchronize: false,
});
