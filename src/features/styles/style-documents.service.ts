import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { Style } from './entities/Style.entity';
import { StyleDocument } from './entities/StyleDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import {
  DocumentPurpose,
  UploadStatus,
} from '../../common/enums/database.enums';
import { assertAllowedFile } from '../../common/utils/file-validation';
import {
  PRESIGN_GET_EXPIRY_SECONDS,
  PRESIGN_PUT_EXPIRY_SECONDS,
  STORAGE_SERVICE,
  StorageService,
} from '../storage/storage.interface';
import { PresignStyleDocumentDto } from './dto/presign-style-document.dto';
import { ConfirmStyleDocumentDto } from './dto/confirm-style-document.dto';

export interface PresignStyleDocumentResult {
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface StyleDocumentListItem {
  documentId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: Date;
  purpose: DocumentPurpose;
}

export interface StyleDocumentViewUrlResult {
  url: string;
  expiresIn: number;
}

@Injectable()
export class StyleDocumentsService {
  constructor(
    @InjectRepository(Style)
    private readonly styleRepo: Repository<Style>,
    @InjectRepository(StyleDocument)
    private readonly styleDocRepo: Repository<StyleDocument>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  private async assertStyleExists(styleId: string): Promise<void> {
    const exists = await this.styleRepo.exist({ where: { id: styleId } });
    if (!exists) {
      throw new NotFoundException(`Không tìm thấy mẫu Fit với ID: ${styleId}`);
    }
  }

  private async findFitAttachmentLink(
    styleId: string,
    documentId: string,
  ): Promise<{ storageKey: string; fileName: string } | null> {
    const row = await this.styleDocRepo
      .createQueryBuilder('sd')
      .innerJoin(Document, 'd', 'd.id = sd.documentId')
      .innerJoin(DocumentVersion, 'v', 'v.id = d.currentVersionId')
      .where('sd.styleId = :styleId', { styleId })
      .andWhere('sd.documentId = :documentId', { documentId })
      .andWhere('sd.purpose = :purpose', {
        purpose: DocumentPurpose.FIT_ATTACHMENT,
      })
      .select('v.storageKey', 'storageKey')
      .addSelect('v.originalFileName', 'fileName')
      .getRawOne();

    return row ?? null;
  }

  async presign(
    styleId: string,
    dto: PresignStyleDocumentDto,
  ): Promise<PresignStyleDocumentResult> {
    await this.assertStyleExists(styleId);
    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes);

    const ext = extname(dto.fileName).toLowerCase();
    const objectKey = `styles/${styleId}/documents/${DocumentPurpose.FIT_ATTACHMENT}/${randomUUID()}${ext}`;

    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      dto.mimeType,
      PRESIGN_PUT_EXPIRY_SECONDS,
    );

    return { objectKey, uploadUrl, expiresIn: PRESIGN_PUT_EXPIRY_SECONDS };
  }

  async confirm(
    styleId: string,
    userId: string | undefined,
    dto: ConfirmStyleDocumentDto,
  ): Promise<StyleDocumentListItem> {
    await this.assertStyleExists(styleId);

    const head = await this.storage.headObject(dto.objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Tệp chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }

    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      const docRepo = manager.getRepository(Document);
      const versionRepo = manager.getRepository(DocumentVersion);
      const styleDocRepo = manager.getRepository(StyleDocument);

      const doc = await docRepo.save(
        docRepo.create({
          title: dto.fileName,
          createdBy: userId || (null as any),
          createdAt: now,
        }),
      );

      const version = await versionRepo.save(
        versionRepo.create({
          documentId: doc.id,
          versionNo: 1,
          originalFileName: dto.fileName,
          storageKey: dto.objectKey,
          mimeType: dto.mimeType,
          byteSize: dto.sizeBytes,
          status: UploadStatus.READY,
          uploadedBy: userId || (null as any),
          uploadedAt: now,
        }),
      );

      doc.currentVersionId = version.id;
      await docRepo.save(doc);

      await styleDocRepo.save(
        styleDocRepo.create({
          styleId,
          documentId: doc.id,
          purpose: DocumentPurpose.FIT_ATTACHMENT,
          linkedBy: userId ?? null,
          linkedAt: now,
        }),
      );

      return {
        documentId: doc.id,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        byteSize: dto.sizeBytes,
        uploadedAt: now,
        purpose: DocumentPurpose.FIT_ATTACHMENT,
      };
    });
  }

  async list(styleId: string): Promise<StyleDocumentListItem[]> {
    await this.assertStyleExists(styleId);

    const rows = await this.styleDocRepo
      .createQueryBuilder('sd')
      .innerJoin(Document, 'd', 'd.id = sd.documentId')
      .innerJoin(DocumentVersion, 'v', 'v.id = d.currentVersionId')
      .where('sd.styleId = :styleId', { styleId })
      .andWhere('sd.purpose = :purpose', {
        purpose: DocumentPurpose.FIT_ATTACHMENT,
      })
      .select('d.id', 'documentId')
      .addSelect('v.originalFileName', 'fileName')
      .addSelect('v.mimeType', 'mimeType')
      .addSelect('v.byteSize', 'byteSize')
      .addSelect('v.uploadedAt', 'uploadedAt')
      .addSelect('sd.purpose', 'purpose')
      .orderBy('v.uploadedAt', 'DESC')
      .getRawMany<{
        documentId: string;
        fileName: string;
        mimeType: string;
        byteSize: string;
        uploadedAt: Date;
        purpose: DocumentPurpose;
      }>();

    return rows.map((row) => ({
      documentId: row.documentId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      byteSize: Number(row.byteSize),
      uploadedAt: row.uploadedAt,
      purpose: row.purpose,
    }));
  }

  async getViewUrl(
    styleId: string,
    documentId: string,
    download: boolean,
  ): Promise<StyleDocumentViewUrlResult> {
    const link = await this.findFitAttachmentLink(styleId, documentId);
    if (!link) {
      throw new NotFoundException('Không tìm thấy tài liệu này trong mẫu Fit.');
    }

    const url = await this.storage.getPresignedGetUrl(
      link.storageKey,
      PRESIGN_GET_EXPIRY_SECONDS,
      download ? link.fileName : undefined,
    );

    return { url, expiresIn: PRESIGN_GET_EXPIRY_SECONDS };
  }

  async remove(styleId: string, documentId: string): Promise<void> {
    const link = await this.styleDocRepo.findOne({
      where: {
        styleId,
        documentId,
        purpose: DocumentPurpose.FIT_ATTACHMENT,
      },
    });
    if (!link) {
      throw new NotFoundException('Không tìm thấy tài liệu này trong mẫu Fit.');
    }
    await this.styleDocRepo.remove(link);
  }
}
