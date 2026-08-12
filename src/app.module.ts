import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { typeOrmConfig } from './database/typeorm.config';

const databaseImports =
  process.env.DB_AUTO_CONNECT === 'true'
    ? [
        TypeOrmModule.forRootAsync({
          useFactory: typeOrmConfig,
        }),
      ]
    : [];

const imports = [
  ConfigModule.forRoot({
    isGlobal: true,
  }),
  ...databaseImports,
];

@Module({
  imports,
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
