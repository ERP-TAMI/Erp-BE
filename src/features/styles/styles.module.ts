import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STYLES_ENTITIES } from './entities';
import { StylesController } from './styles.controller';
import { StylesService } from './styles.service';

@Module({
  imports: [TypeOrmModule.forFeature(STYLES_ENTITIES)],
  controllers: [StylesController],
  providers: [StylesService],
  exports: [StylesService],
})
export class StylesModule {}
