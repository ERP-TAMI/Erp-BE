import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DOCUMENTS_ENTITIES } from './entities';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([...DOCUMENTS_ENTITIES, StyleDocument]),
    StorageModule,
    AuditModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
