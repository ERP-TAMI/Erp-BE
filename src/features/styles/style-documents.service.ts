import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
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
import {
  assertAllowedFile,
  DEFAULT_MAX_UPLOAD_SIZE_BYTES,
} from '../../common/utils/file-validation';
import {
  MAGIC_BYTES_SAMPLE_SIZE,
  TEXT_EXTENSIONS_SCANNED_IN_FULL,
  validateFileMagicBytes,
} from '../../common/utils/file-magic-bytes.util';
import {
  PRESIGN_GET_EXPIRY_SECONDS,
  PRESIGN_PUT_EXPIRY_SECONDS,
  STORAGE_SERVICE,
  StorageService,
} from '../storage/storage.interface';
import {
  isDuplicateStorageKeyError,
  isObjectKeyInScope,
} from '../storage/storage-key.util';
import { PresignStyleDocumentDto } from './dto/presign-style-document.dto';
import { ConfirmStyleDocumentDto } from './dto/confirm-style-document.dto';
import { AuditService } from '../audit/audit.service';
import { AuditActor } from '../audit/audit-actor.type';
import { AuditEventType } from '../../common/enums/database.enums';

const AGGREGATE_TYPE = 'StyleDocument';

export interface PresignStyleDocumentResult {
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface StyleDocumentListItem {
  documentId: string;
  documentVersionId: string;
  versionNo: number;
  isCurrentVersion: boolean;
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
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
    @InjectRepository(DocumentVersion)
    private readonly versionRepo: Repository<DocumentVersion>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
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
      .innerJoin(
        DocumentVersion,
        'v',
        'v.id = COALESCE(sd.documentVersionId, d.currentVersionId)',
      )
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
    actor?: AuditActor,
  ): Promise<StyleDocumentListItem> {
    await this.assertStyleExists(styleId);

    if (!isObjectKeyInScope(dto.objectKey, `styles/${styleId}/documents/`)) {
      throw new BadRequestException(
        'objectKey không thuộc phạm vi tải lên này, vui lòng lấy lại link upload.',
      );
    }

    const head = await this.storage.headObject(dto.objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Tệp chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }
    // sizeBytes at presign is client-declared and unenforceable — S3 presigned
    // PUT has no way to cap it. Check the real uploaded size here instead.
    if (head.sizeBytes && head.sizeBytes > DEFAULT_MAX_UPLOAD_SIZE_BYTES) {
      await this.storage.deleteObject(dto.objectKey);
      throw new BadRequestException(
        `Dung lượng tệp vượt quá giới hạn ${(DEFAULT_MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB.`,
      );
    }

    // Server không nhận file thô (client PUT thẳng lên S3), nên phần kiểm tra
    // magic-byte phải chạy ở đây, đọc từ nội dung thật đã lưu trên S3 — client
    // tự khai fileName/mimeType, một file HTML/script đổi đuôi .pdf vẫn qua
    // được assertAllowedFile() vì hàm đó chỉ so tên/mimeType.
    const ext = extname(dto.fileName).toLowerCase();
    const magicByteSample = TEXT_EXTENSIONS_SCANNED_IN_FULL.has(ext)
      ? await this.storage.getObjectBuffer(dto.objectKey)
      : await this.storage.getObjectHead(
          dto.objectKey,
          MAGIC_BYTES_SAMPLE_SIZE,
        );
    validateFileMagicBytes(ext, magicByteSample);

    const now = new Date();

    return this.dataSource
      .transaction(async (manager) => {
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
            documentVersionId: version.id,
            purpose: DocumentPurpose.FIT_ATTACHMENT,
            linkedBy: userId ?? null,
            linkedAt: now,
          }),
        );

        if (actor) {
          await this.auditService.recordEntityChange(manager, {
            aggregateType: AGGREGATE_TYPE,
            aggregateId: doc.id,
            parentId: styleId,
            actorId: actor.id,
            actorRole: actor.roleCode,
            targetLabel: dto.fileName,
            eventType: AuditEventType.CREATED,
            changes: [
              { fieldName: 'fileName', oldValue: null, newValue: dto.fileName },
              {
                fieldName: 'purpose',
                oldValue: null,
                newValue: DocumentPurpose.FIT_ATTACHMENT,
              },
            ],
          });
        }

        return {
          documentId: doc.id,
          documentVersionId: version.id,
          versionNo: version.versionNo,
          isCurrentVersion: true,
          fileName: dto.fileName,
          mimeType: dto.mimeType,
          byteSize: dto.sizeBytes,
          uploadedAt: now,
          purpose: DocumentPurpose.FIT_ATTACHMENT,
        };
      })
      .catch((error) => {
        if (isDuplicateStorageKeyError(error)) {
          throw new BadRequestException(
            'Tệp này đã được đính kèm trong hệ thống, không thể đính kèm lại.',
          );
        }
        throw error;
      });
  }

  async list(styleId: string): Promise<StyleDocumentListItem[]> {
    await this.assertStyleExists(styleId);

    const rows = await this.styleDocRepo
      .createQueryBuilder('sd')
      .innerJoin(Document, 'd', 'd.id = sd.documentId')
      .innerJoin(
        DocumentVersion,
        'v',
        'v.id = COALESCE(sd.documentVersionId, d.currentVersionId)',
      )
      .where('sd.styleId = :styleId', { styleId })
      .andWhere('sd.purpose = :purpose', {
        purpose: DocumentPurpose.FIT_ATTACHMENT,
      })
      .select('d.id', 'documentId')
      .addSelect('v.id', 'documentVersionId')
      .addSelect('v.versionNo', 'versionNo')
      .addSelect('d.currentVersionId', 'currentVersionId')
      .addSelect('v.originalFileName', 'fileName')
      .addSelect('v.mimeType', 'mimeType')
      .addSelect('v.byteSize', 'byteSize')
      .addSelect('v.uploadedAt', 'uploadedAt')
      .addSelect('sd.purpose', 'purpose')
      .orderBy('v.uploadedAt', 'DESC')
      .getRawMany<{
        documentId: string;
        documentVersionId: string;
        versionNo: number;
        currentVersionId: string;
        fileName: string;
        mimeType: string;
        byteSize: string;
        uploadedAt: Date;
        purpose: DocumentPurpose;
      }>();

    return rows.map((row) => ({
      documentId: row.documentId,
      documentVersionId: row.documentVersionId,
      versionNo: Number(row.versionNo),
      isCurrentVersion: row.documentVersionId === row.currentVersionId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      byteSize: Number(row.byteSize),
      uploadedAt: row.uploadedAt,
      purpose: row.purpose,
    }));
  }

  async assignFromLibrary(
    styleId: string,
    documentIds: string[],
    actor: AuditActor,
  ): Promise<StyleDocumentListItem[]> {
    await this.assertStyleExists(styleId);
    const uniqueIds = [...new Set(documentIds)];
    if (uniqueIds.length === 0) return this.list(styleId);

    const documents = await this.docRepo.find({
      where: { id: In(uniqueIds) },
    });
    if (documents.length !== uniqueIds.length) {
      throw new NotFoundException('Một hoặc nhiều tài liệu không còn tồn tại.');
    }
    if (documents.some((document) => document.archivedAt)) {
      throw new BadRequestException('Không thể gán tài liệu đã lưu trữ.');
    }

    const currentVersionIds = documents
      .map((document) => document.currentVersionId)
      .filter((versionId): versionId is string => Boolean(versionId));
    if (currentVersionIds.length !== documents.length) {
      throw new BadRequestException(
        'Một hoặc nhiều tài liệu chưa có version hiện tại.',
      );
    }

    const versions = await this.versionRepo.find({
      where: { id: In(currentVersionIds), status: UploadStatus.READY },
    });
    const versionById = new Map(
      versions.map((version) => [version.id, version]),
    );
    for (const document of documents) {
      const currentVersion = document.currentVersionId
        ? versionById.get(document.currentVersionId)
        : undefined;
      if (!currentVersion || currentVersion.documentId !== document.id) {
        throw new BadRequestException(
          'Version hiện tại của tài liệu không hợp lệ.',
        );
      }
    }

    const existingLinks = await this.styleDocRepo.find({
      where: {
        styleId,
        documentId: In(uniqueIds),
      },
    });
    const existingByDocumentId = new Map(
      existingLinks.map((link) => [link.documentId, link]),
    );
    const linksToPromote = existingLinks.filter(
      (link) => link.purpose !== DocumentPurpose.FIT_ATTACHMENT,
    );
    const newLinks = documents
      .filter((document) => !existingByDocumentId.has(document.id))
      .map((document) =>
        this.styleDocRepo.create({
          styleId,
          documentId: document.id,
          documentVersionId: document.currentVersionId,
          purpose: DocumentPurpose.FIT_ATTACHMENT,
          linkedBy: actor.id,
          linkedAt: new Date(),
        }),
      );

    if (newLinks.length > 0 || linksToPromote.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        const txStyleDocRepo = manager.getRepository(StyleDocument);

        for (const link of linksToPromote) {
          const document = documents.find(
            (item) => item.id === link.documentId,
          );
          const previousPurpose = link.purpose;
          const previousVersionId = link.documentVersionId;
          link.purpose = DocumentPurpose.FIT_ATTACHMENT;
          link.documentVersionId = document?.currentVersionId ?? null;
          link.linkedBy = actor.id;
          link.linkedAt = new Date();
          await txStyleDocRepo.save(link);
          await this.auditService.recordEntityChange(manager, {
            aggregateType: AGGREGATE_TYPE,
            aggregateId: link.documentId,
            parentId: styleId,
            actorId: actor.id,
            actorRole: actor.roleCode,
            targetLabel: document?.title,
            eventType: AuditEventType.UPDATED,
            changes: [
              {
                fieldName: 'purpose',
                oldValue: previousPurpose,
                newValue: DocumentPurpose.FIT_ATTACHMENT,
              },
              {
                fieldName: 'documentVersionId',
                oldValue: previousVersionId,
                newValue: document?.currentVersionId ?? null,
              },
            ],
          });
        }

        const result =
          newLinks.length > 0
            ? await txStyleDocRepo
                .createQueryBuilder()
                .insert()
                .values(newLinks)
                .orIgnore()
                .returning('*')
                .execute()
            : { raw: [] };

        for (const inserted of result.raw as Array<{
          document_id: string;
          document_version_id: string;
        }>) {
          const document = documents.find(
            (item) => item.id === inserted.document_id,
          );
          const version = versionById.get(inserted.document_version_id);
          await this.auditService.recordEntityChange(manager, {
            aggregateType: AGGREGATE_TYPE,
            aggregateId: inserted.document_id,
            parentId: styleId,
            actorId: actor.id,
            actorRole: actor.roleCode,
            targetLabel: document?.title,
            eventType: AuditEventType.CREATED,
            changes: [
              {
                fieldName: 'documentVersionId',
                oldValue: null,
                newValue: inserted.document_version_id,
              },
              {
                fieldName: 'versionNo',
                oldValue: null,
                newValue: version?.versionNo.toString() ?? null,
              },
            ],
          });
        }
      });
    }

    return this.list(styleId);
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

  async remove(
    styleId: string,
    documentId: string,
    actor?: AuditActor,
  ): Promise<void> {
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

    const fileName = await this.resolveFileName(
      documentId,
      link.documentVersionId,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(StyleDocument).remove(link);
      if (actor) {
        await this.auditService.recordEntityChange(manager, {
          aggregateType: AGGREGATE_TYPE,
          aggregateId: documentId,
          parentId: styleId,
          actorId: actor.id,
          actorRole: actor.roleCode,
          targetLabel: fileName,
          eventType: AuditEventType.DELETED,
          changes: [],
        });
      }
    });
  }

  private async resolveFileName(
    documentId: string,
    documentVersionId?: string | null,
  ): Promise<string | undefined> {
    if (documentVersionId) {
      const version = await this.versionRepo.findOne({
        where: { id: documentVersionId, documentId },
      });
      if (version) return version.originalFileName;
    }
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    return doc?.title;
  }
}
