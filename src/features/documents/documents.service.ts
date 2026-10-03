import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { Document } from './entities/Document.entity';
import { DocumentFolder } from './entities/DocumentFolder.entity';
import { DocumentVersion } from './entities/DocumentVersion.entity';
import { FolderDocument } from './entities/FolderDocument.entity';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import {
  UploadStatus,
  AuditEventType,
  DocumentPurpose,
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
import { isObjectKeyInScope } from '../storage/storage-key.util';
import { AuditService } from '../audit/audit.service';
import { AuditActor } from '../audit/audit-actor.type';
import {
  ConfirmDocumentVersionDto,
  ConfirmLibraryDocumentDto,
  DocumentFolderDto,
  DocumentFoldersQueryDto,
  DocumentLibraryQueryDto,
  DocumentLibrarySearchQueryDto,
  MoveLibraryDocumentsDto,
  PresignDocumentVersionDto,
  PresignLibraryDocumentDto,
} from './dto/document-library.dto';

export type DocumentFolderListItem = {
  id: string;
  parentId: string | null;
  folderName: string;
  parentFolderName: string | null;
  createdAt: Date;
  documentCount: number;
  hasChildren: boolean;
};

export type DocumentLibraryListItem = {
  documentId: string;
  title: string;
  folderId: string;
  folderName: string;
  versionId: string;
  versionNo: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: Date;
  isAssigned: boolean;
};

export type DocumentLibraryPage = {
  data: DocumentLibraryListItem[];
  meta: {
    total: number;
    totalBytes: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type DocumentLibrarySearchPathItem = {
  id: string;
  parentId: string | null;
  folderName: string;
};

export type DocumentLibrarySearchResult =
  | {
      kind: 'folder';
      id: string;
      folderName: string;
      createdAt: Date;
      path: DocumentLibrarySearchPathItem[];
    }
  | {
      kind: 'file';
      documentId: string;
      title: string;
      folderId: string;
      folderName: string;
      versionId: string;
      versionNo: number;
      fileName: string;
      mimeType: string;
      byteSize: number;
      uploadedAt: Date;
      isAssigned: boolean;
      path: DocumentLibrarySearchPathItem[];
    };

export type DocumentLibrarySearchPage = {
  data: DocumentLibrarySearchResult[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

export type DocumentVersionListItem = {
  versionId: string;
  versionNo: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadedAt: Date;
  uploadedBy: string | null;
  changeReason: string | null;
  isCurrent: boolean;
};

export type PresignLibraryDocumentResult = {
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
};

export type DocumentViewUrlResult = {
  url: string;
  expiresIn: number;
};

const AGGREGATE_TYPE = 'Document';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(DocumentVersion)
    private readonly versionRepo: Repository<DocumentVersion>,
    @InjectRepository(DocumentFolder)
    private readonly folderRepo: Repository<DocumentFolder>,
    @InjectRepository(FolderDocument)
    private readonly folderDocumentRepo: Repository<FolderDocument>,
    @InjectRepository(StyleDocument)
    private readonly styleDocumentRepo: Repository<StyleDocument>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async listFolders(
    query: DocumentFoldersQueryDto = {},
  ): Promise<DocumentFolderListItem[]> {
    const folderQuery = this.folderRepo
      .createQueryBuilder('folder')
      .leftJoin(
        FolderDocument,
        'folderDocument',
        'folderDocument.folderId = folder.id',
      )
      .leftJoin(
        Document,
        'document',
        'document.id = folderDocument.documentId AND document.archivedAt IS NULL',
      )
      .leftJoin(
        DocumentFolder,
        'parentFolder',
        'parentFolder.id = folder.parentId',
      )
      .leftJoin(
        DocumentFolder,
        'childFolder',
        'childFolder.parentId = folder.id',
      )
      .select('folder.id', 'id')
      .addSelect('folder.parentId', 'parentId')
      .addSelect('folder.folderName', 'folderName')
      .addSelect('parentFolder.folderName', 'parentFolderName')
      .addSelect('folder.createdAt', 'createdAt')
      .addSelect('COUNT(DISTINCT document.id)', 'documentCount')
      .addSelect('COUNT(DISTINCT childFolder.id)', 'childCount')
      .groupBy('folder.id')
      .addGroupBy('parentFolder.folderName')
      .orderBy('folder.folderName', 'ASC');

    const search = query.search?.trim();
    if (search) {
      folderQuery.andWhere('folder.folderName ILIKE :search', {
        search: `%${search}%`,
      });
    } else if (query.parentId) {
      folderQuery.andWhere('folder.parentId = :parentId', {
        parentId: query.parentId,
      });
    } else {
      folderQuery.andWhere('folder.parentId IS NULL');
    }

    const rows = await folderQuery.getRawMany<{
      id: string;
      parentId: string | null;
      folderName: string;
      parentFolderName: string | null;
      createdAt: Date;
      documentCount: string;
      childCount: string;
    }>();

    return rows.map(({ childCount, ...row }) => ({
      ...row,
      documentCount: Number(row.documentCount),
      hasChildren: Number(childCount) > 0,
    }));
  }

  async search(
    query: DocumentLibrarySearchQueryDto,
  ): Promise<DocumentLibrarySearchPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const term = query.search.trim();
    const pattern = `%${term}%`;
    const rows = await this.dataSource.query(
      `
        WITH search_results AS (
          SELECT
            'folder'::text AS kind,
            folder.id AS result_id,
            folder.folder_name AS name,
            NULL::text AS title,
            NULL::uuid AS document_id,
            folder.id AS folder_id,
            NULL::uuid AS version_id,
            NULL::integer AS version_no,
            NULL::text AS mime_type,
            NULL::bigint AS byte_size,
            folder.created_at AS occurred_at,
            false AS is_assigned
          FROM document_folders folder
          WHERE folder.folder_name ILIKE $1

          UNION ALL

          SELECT
            'file'::text AS kind,
            document.id AS result_id,
            version.original_file_name AS name,
            document.title AS title,
            document.id AS document_id,
            folder.id AS folder_id,
            version.id AS version_id,
            version.version_no AS version_no,
            version.mime_type AS mime_type,
            version.byte_size AS byte_size,
            version.uploaded_at AS occurred_at,
            EXISTS (
              SELECT 1
              FROM style_documents assigned_document
              WHERE assigned_document.document_id = document.id
                AND assigned_document.purpose = $2
            ) AS is_assigned
          FROM documents document
          INNER JOIN document_versions version
            ON version.id = document.current_version_id
          INNER JOIN folder_documents folder_document
            ON folder_document.document_id = document.id
          INNER JOIN document_folders folder
            ON folder.id = folder_document.folder_id
          WHERE document.archived_at IS NULL
            AND (document.title ILIKE $1 OR version.original_file_name ILIKE $1)
        )
        SELECT search_results.*, COUNT(*) OVER() AS total_count
        FROM search_results
        ORDER BY
          CASE WHEN kind = 'folder' THEN 0 ELSE 1 END,
          LOWER(name),
          result_id
        LIMIT $3 OFFSET $4
      `,
      [pattern, DocumentPurpose.FIT_ATTACHMENT, limit, (page - 1) * limit],
    ) as Array<{
      kind: 'folder' | 'file';
      result_id: string;
      name: string;
      title: string | null;
      document_id: string | null;
      folder_id: string | null;
      version_id: string | null;
      version_no: number | null;
      mime_type: string | null;
      byte_size: string | null;
      occurred_at: Date;
      is_assigned: boolean;
      total_count: string;
    }>;
    // COUNT(*) OVER() has no row to carry the count when the requested page is
    // beyond the last page, so fetch the count explicitly in that case.
    const total = Number(
      rows[0]?.total_count ??
        (await this.dataSource.query(
          `
            SELECT
              (SELECT COUNT(*) FROM document_folders WHERE folder_name ILIKE $1)
              +
              (SELECT COUNT(*)
               FROM documents document
               INNER JOIN document_versions version
                 ON version.id = document.current_version_id
               INNER JOIN folder_documents folder_document
                 ON folder_document.document_id = document.id
               WHERE document.archived_at IS NULL
                 AND (document.title ILIKE $1 OR version.original_file_name ILIKE $1))
                AS total_count
          `,
          [pattern],
        ))[0]?.total_count ??
        0,
    );
    const folderIds = [...new Set(rows.map((row) => row.folder_id).filter((id): id is string => Boolean(id)))];
    const pathRows = folderIds.length
      ? (await this.dataSource.query(
          `
            WITH RECURSIVE folder_paths AS (
              SELECT
                folder.id AS result_folder_id,
                folder.id,
                folder.parent_id,
                folder.folder_name,
                ARRAY[folder.id]::uuid[] AS folder_ids,
                ARRAY[folder.folder_name]::text[] AS folder_names
              FROM document_folders folder
              WHERE folder.id = ANY($1::uuid[])

              UNION ALL

              SELECT
                child_path.result_folder_id,
                parent.id,
                parent.parent_id,
                parent.folder_name,
                ARRAY[parent.id] || child_path.folder_ids,
                ARRAY[parent.folder_name] || child_path.folder_names
              FROM folder_paths child_path
              INNER JOIN document_folders parent
                ON parent.id = child_path.parent_id
            )
            SELECT DISTINCT ON (result_folder_id)
              result_folder_id, folder_ids, folder_names
            FROM folder_paths
            WHERE parent_id IS NULL
          `,
          [folderIds],
        )) as Array<{
          result_folder_id: string;
          folder_ids: string[];
          folder_names: string[];
        }>
      : [];
    const pathsByFolderId = new Map(pathRows.map((row) => [row.result_folder_id, row]));

    return {
      data: rows.map((row) => {
        const folderPath = pathsByFolderId.get(row.folder_id!)!;
        const path = folderPath.folder_ids.map((id, index) => ({
          id,
          parentId: index > 0 ? folderPath.folder_ids[index - 1] : null,
          folderName: folderPath.folder_names[index],
        }));
        if (row.kind === 'folder') {
          return {
            kind: 'folder' as const,
            id: row.result_id,
            folderName: row.name,
            createdAt: row.occurred_at,
            path,
          };
        }
        return {
          kind: 'file' as const,
          documentId: row.document_id!,
          title: row.title!,
          folderId: row.folder_id!,
          folderName: folderPath.folder_names.at(-1)!,
          versionId: row.version_id!,
          versionNo: Number(row.version_no),
          fileName: row.name,
          mimeType: row.mime_type!,
          byteSize: Number(row.byte_size),
          uploadedAt: row.occurred_at,
          isAssigned: Boolean(row.is_assigned),
          path,
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async createFolder(
    dto: DocumentFolderDto,
    actorId: string,
  ): Promise<DocumentFolder> {
    const folderName = dto.folderName.trim();
    if (!folderName)
      throw new BadRequestException('Tên thư mục không được để trống.');
    if (dto.parentId) await this.assertFolderExists(dto.parentId);

    return this.folderRepo.save(
      this.folderRepo.create({
        folderName,
        parentId: dto.parentId ?? null,
        createdBy: actorId,
        createdAt: new Date(),
      }),
    );
  }

  async renameFolder(
    folderId: string,
    dto: DocumentFolderDto,
  ): Promise<DocumentFolder> {
    const folder = await this.assertFolderExists(folderId);
    if (dto.parentId && dto.parentId !== folder.parentId) {
      const newParent = await this.assertFolderExists(dto.parentId);
      const visited = new Set<string>([folderId]);
      let ancestorId = newParent.id;
      while (ancestorId) {
        if (visited.has(ancestorId)) {
          throw new BadRequestException(
            'Không thể di chuyển thư mục vào bên trong cây con của chính nó.',
          );
        }
        visited.add(ancestorId);
        const ancestor = await this.folderRepo.findOne({
          where: { id: ancestorId },
          select: { id: true, parentId: true },
        });
        ancestorId = ancestor?.parentId ?? '';
      }
      folder.parentId = newParent.id;
    }
    const folderName = dto.folderName.trim();
    if (!folderName)
      throw new BadRequestException('Tên thư mục không được để trống.');
    folder.folderName = folderName;
    return this.folderRepo.save(folder);
  }

  async deleteFolder(folderId: string, actor?: AuditActor): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const folderRepo = manager.getRepository(DocumentFolder);
      const folderDocumentRepo = manager.getRepository(FolderDocument);
      const documentRepo = manager.getRepository(Document);
      const folder = await folderRepo.findOne({
        where: { id: folderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!folder)
        throw new NotFoundException('Không tìm thấy thư mục tài liệu.');

      const childFolders = await folderRepo.count({
        where: { parentId: folderId },
      });
      if (childFolders > 0) {
        throw new ConflictException(
          'Không thể xóa thư mục vì đang chứa thư mục con. Hãy xóa hoặc di chuyển thư mục con trước.',
        );
      }

      const folderLinks = await folderDocumentRepo.find({
        where: { folderId },
      });
      const documentIds = [
        ...new Set(folderLinks.map((link) => link.documentId)),
      ];
      const allLinks = documentIds.length
        ? await folderDocumentRepo.find({
            where: { documentId: In(documentIds) },
          })
        : [];
      const linkedElsewhere = new Set(
        allLinks
          .filter((link) => link.folderId !== folderId)
          .map((link) => link.documentId),
      );
      const documentIdsToArchive = documentIds.filter(
        (documentId) => !linkedElsewhere.has(documentId),
      );
      const documentsToArchive = documentIdsToArchive.length
        ? await documentRepo.find({
            where: { id: In(documentIdsToArchive), archivedAt: IsNull() },
          })
        : [];

      await folderDocumentRepo.delete({ folderId });

      const archivedAt = new Date();
      for (const document of documentsToArchive) {
        document.archivedAt = archivedAt;
        await documentRepo.save(document);
        if (actor) {
          await this.auditService.recordEntityChange(manager, {
            aggregateType: AGGREGATE_TYPE,
            aggregateId: document.id,
            actorId: actor.id,
            actorRole: actor.roleCode,
            targetLabel: document.title,
            eventType: AuditEventType.STATUS_CHANGED,
            changes: [
              {
                fieldName: 'archivedAt',
                oldValue: null,
                newValue: archivedAt.toISOString(),
              },
            ],
          });
        }
      }

      await folderRepo.remove(folder);
    });
  }

  async list(query: DocumentLibraryQueryDto): Promise<DocumentLibraryPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const folderLinkCondition = query.folderId
      ? 'folderDocument.documentId = document.id AND folderDocument.folderId = :folderId'
      : 'folderDocument.documentId = document.id';
    const qb = this.documentRepo
      .createQueryBuilder('document')
      .innerJoin(
        DocumentVersion,
        'version',
        'version.id = document.currentVersionId',
      )
      .innerJoin(
        FolderDocument,
        'folderDocument',
        folderLinkCondition,
        query.folderId ? { folderId: query.folderId } : undefined,
      )
      .innerJoin(
        DocumentFolder,
        'folder',
        'folder.id = folderDocument.folderId',
      )
      .where(
        query.archived === 'true'
          ? 'document.archivedAt IS NOT NULL'
          : 'document.archivedAt IS NULL',
      )
      .setParameter('fitAttachmentPurpose', DocumentPurpose.FIT_ATTACHMENT);

    if (query.assigned === 'true') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM style_documents assignedDocument WHERE assignedDocument.document_id = document.id AND assignedDocument.purpose = :fitAttachmentPurpose)',
        { fitAttachmentPurpose: DocumentPurpose.FIT_ATTACHMENT },
      );
    } else if (query.assigned === 'false') {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM style_documents assignedDocument WHERE assignedDocument.document_id = document.id AND assignedDocument.purpose = :fitAttachmentPurpose)',
        { fitAttachmentPurpose: DocumentPurpose.FIT_ATTACHMENT },
      );
    }
    if (query.search?.trim()) {
      qb.andWhere(
        '(document.title ILIKE :search OR version.originalFileName ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }
    const extensionPatterns = {
      word: String.raw`\.(docx|doc|rtf|odt)$`,
      excel: String.raw`\.(xlsx|xls|csv|tsv|ods)$`,
      pdf: String.raw`\.pdf$`,
      image: String.raw`\.(png|jpg|jpeg|webp|gif|svg|bmp|tiff|ico|heic)$`,
    } as const;
    if (query.category) {
      qb.andWhere('LOWER(version.originalFileName) ~ :categoryPattern', {
        categoryPattern: extensionPatterns[query.category],
      });
    }

    const countResult = await qb
      .clone()
      .select('COUNT(*)', 'total')
      .addSelect('COALESCE(SUM(version.byteSize), 0)', 'totalBytes')
      .getRawOne<{ total: string; totalBytes: string }>();
    const total = Number(countResult?.total ?? 0);
    const totalBytes = Number(countResult?.totalBytes ?? 0);

    const rows = await qb
      .select('document.id', 'documentId')
      .addSelect('document.title', 'title')
      .addSelect('folder.id', 'folderId')
      .addSelect('folder.folderName', 'folderName')
      .addSelect('version.id', 'versionId')
      .addSelect('version.versionNo', 'versionNo')
      .addSelect('version.originalFileName', 'fileName')
      .addSelect('version.mimeType', 'mimeType')
      .addSelect('version.byteSize', 'byteSize')
      .addSelect('version.uploadedAt', 'uploadedAt')
      .addSelect(
        'EXISTS (SELECT 1 FROM style_documents assignedDocument WHERE assignedDocument.document_id = document.id AND assignedDocument.purpose = :fitAttachmentPurpose)',
        'isAssigned',
      )
      .orderBy(
        'version.uploadedAt',
        query.sortOrder === 'oldest' ? 'ASC' : 'DESC',
      )
      .addOrderBy('document.id', 'ASC')
      .addOrderBy('folderDocument.folderId', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        documentId: string;
        title: string;
        folderId: string;
        folderName: string;
        versionId: string;
        versionNo: number;
        fileName: string;
        mimeType: string;
        byteSize: string;
        uploadedAt: Date;
        isAssigned: boolean;
      }>();

    return {
      data: rows.map((row) => ({
        ...row,
        byteSize: Number(row.byteSize),
        isAssigned: Boolean(row.isAssigned),
      })),
      meta: {
        total,
        totalBytes,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async presignInitialUpload(
    dto: PresignLibraryDocumentDto,
  ): Promise<PresignLibraryDocumentResult> {
    await this.assertFolderExists(dto.folderId);
    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes);
    const ext = extname(dto.fileName).toLowerCase();
    const objectKey = `documents/library/${dto.folderId}/pending/${randomUUID()}${ext}`;
    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      dto.mimeType,
      PRESIGN_PUT_EXPIRY_SECONDS,
    );
    return { objectKey, uploadUrl, expiresIn: PRESIGN_PUT_EXPIRY_SECONDS };
  }

  async confirmInitialUpload(
    dto: ConfirmLibraryDocumentDto,
    actorId: string,
    actor?: AuditActor,
  ): Promise<DocumentLibraryListItem> {
    const objectKey = `documents/library/${dto.folderId}/pending/`;
    const actualSize = await this.validateUploadedObject(
      dto.objectKey,
      objectKey,
      dto.fileName,
      dto.mimeType,
      dto.sizeBytes,
    );
    const now = new Date();

    const documentId = await this.dataSource.transaction(async (manager) => {
      const documentRepo = manager.getRepository(Document);
      const versionRepo = manager.getRepository(DocumentVersion);
      const folderDocumentRepo = manager.getRepository(FolderDocument);

      const document = await documentRepo.save(
        documentRepo.create({
          title: dto.fileName,
          createdBy: actorId,
          createdAt: now,
          archivedAt: null,
        }),
      );
      const version = await versionRepo.save(
        versionRepo.create({
          documentId: document.id,
          versionNo: 1,
          originalFileName: dto.fileName,
          storageKey: dto.objectKey,
          mimeType: dto.mimeType,
          byteSize: actualSize,
          status: UploadStatus.READY,
          uploadedBy: actorId,
          uploadedAt: now,
        }),
      );
      document.currentVersionId = version.id;
      await documentRepo.save(document);
      await folderDocumentRepo.save(
        folderDocumentRepo.create({
          folderId: dto.folderId,
          documentId: document.id,
          linkedAt: now,
          linkedBy: actorId,
        }),
      );

      if (actor) {
        await this.auditService.recordEntityChange(manager, {
          aggregateType: AGGREGATE_TYPE,
          aggregateId: document.id,
          actorId: actor.id,
          actorRole: actor.roleCode,
          targetLabel: dto.fileName,
          eventType: AuditEventType.CREATED,
          changes: [
            { fieldName: 'title', oldValue: null, newValue: dto.fileName },
            { fieldName: 'versionNo', oldValue: null, newValue: '1' },
          ],
        });
      }
      return document.id;
    });

    const item = (await this.list({ folderId: dto.folderId })).data.find(
      (row) => row.documentId === documentId,
    );
    if (!item) throw new NotFoundException('Không thể tải tài liệu vừa lưu.');
    return item;
  }

  async presignVersionUpload(
    documentId: string,
    dto: PresignDocumentVersionDto,
  ): Promise<PresignLibraryDocumentResult> {
    const document = await this.assertDocumentExists(documentId, true);
    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes);
    const ext = extname(dto.fileName).toLowerCase();
    const objectKey = `documents/library/${document.id}/versions/${randomUUID()}${ext}`;
    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      dto.mimeType,
      PRESIGN_PUT_EXPIRY_SECONDS,
    );
    return { objectKey, uploadUrl, expiresIn: PRESIGN_PUT_EXPIRY_SECONDS };
  }

  async confirmVersionUpload(
    documentId: string,
    dto: ConfirmDocumentVersionDto,
    actorId: string,
    actor?: AuditActor,
  ): Promise<DocumentVersionListItem> {
    const scope = `documents/library/${documentId}/versions/`;
    const actualSize = await this.validateUploadedObject(
      dto.objectKey,
      scope,
      dto.fileName,
      dto.mimeType,
      dto.sizeBytes,
    );
    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      const documentRepo = manager.getRepository(Document);
      const versionRepo = manager.getRepository(DocumentVersion);
      const document = await documentRepo.findOne({
        where: { id: documentId, archivedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!document)
        throw new NotFoundException('Không tìm thấy tài liệu trong kho.');

      const previousVersion = await versionRepo.findOne({
        where: { documentId },
        order: { versionNo: 'DESC' },
      });
      const versionNo = (previousVersion?.versionNo ?? 0) + 1;
      const version = await versionRepo.save(
        versionRepo.create({
          documentId,
          versionNo,
          originalFileName: dto.fileName,
          storageKey: dto.objectKey,
          mimeType: dto.mimeType,
          byteSize: actualSize,
          status: UploadStatus.READY,
          changeReason: dto.changeReason?.trim() || null,
          uploadedBy: actorId,
          uploadedAt: now,
        }),
      );
      document.currentVersionId = version.id;
      await documentRepo.save(document);

      if (actor) {
        await this.auditService.recordEntityChange(manager, {
          aggregateType: AGGREGATE_TYPE,
          aggregateId: documentId,
          actorId: actor.id,
          actorRole: actor.roleCode,
          targetLabel: document.title,
          eventType: AuditEventType.UPDATED,
          changes: [
            {
              fieldName: 'currentVersion',
              oldValue: previousVersion?.versionNo?.toString() ?? null,
              newValue: versionNo.toString(),
            },
            {
              fieldName: 'changeReason',
              oldValue: null,
              newValue: dto.changeReason?.trim() || null,
            },
          ],
        });
      }

      return this.toVersionItem(version, true);
    });
  }

  async listVersions(documentId: string): Promise<DocumentVersionListItem[]> {
    const document = await this.assertDocumentExists(documentId);
    const versions = await this.versionRepo.find({
      where: { documentId, status: UploadStatus.READY },
      order: { versionNo: 'DESC' },
    });
    return versions.map((version) =>
      this.toVersionItem(version, version.id === document.currentVersionId),
    );
  }

  async getViewUrl(
    documentId: string,
    versionId?: string,
    download = false,
  ): Promise<DocumentViewUrlResult> {
    const document = await this.assertDocumentExists(documentId);
    const selectedVersionId = versionId ?? document.currentVersionId;
    if (!selectedVersionId) {
      throw new NotFoundException('Tài liệu chưa có phiên bản khả dụng.');
    }
    const version = await this.versionRepo.findOne({
      where: {
        id: selectedVersionId,
        documentId,
        status: UploadStatus.READY,
      },
    });
    if (!version)
      throw new NotFoundException('Không tìm thấy phiên bản tài liệu.');
    const url = await this.storage.getPresignedGetUrl(
      version.storageKey,
      PRESIGN_GET_EXPIRY_SECONDS,
      download ? version.originalFileName : undefined,
    );
    return { url, expiresIn: PRESIGN_GET_EXPIRY_SECONDS };
  }

  async archive(documentId: string, actor?: AuditActor): Promise<void> {
    const document = await this.assertDocumentExists(documentId, true);
    const archivedAt = new Date();
    document.archivedAt = archivedAt;
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Document).save(document);
      if (actor) {
        await this.auditService.recordEntityChange(manager, {
          aggregateType: AGGREGATE_TYPE,
          aggregateId: documentId,
          actorId: actor.id,
          actorRole: actor.roleCode,
          targetLabel: document.title,
          eventType: AuditEventType.STATUS_CHANGED,
          changes: [
            {
              fieldName: 'archivedAt',
              oldValue: null,
              newValue: archivedAt.toISOString(),
            },
          ],
        });
      }
    });
  }

  async moveDocuments(
    dto: MoveLibraryDocumentsDto,
    actor: AuditActor,
  ): Promise<{ movedCount: number; targetFolderId: string }> {
    return this.dataSource.transaction(async (manager) => {
      const folder = await manager.getRepository(DocumentFolder).findOne({
        where: { id: dto.targetFolderId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!folder) throw new NotFoundException('Không tìm thấy thư mục đích.');

      const documentRepo = manager.getRepository(Document);
      const documents = await documentRepo.find({
        where: { id: In(dto.documentIds), archivedAt: IsNull() },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (documents.length !== dto.documentIds.length) {
        throw new NotFoundException('Một hoặc nhiều tài liệu không còn trong kho.');
      }

      const links = await manager.getRepository(FolderDocument).find({
        where: { documentId: In(dto.documentIds) },
        order: { documentId: 'ASC' },
      });
      if (links.length !== documents.length) {
        throw new ConflictException('Một hoặc nhiều tài liệu chưa có thư mục.');
      }

      const linksToMove = links.filter(
        (link) => link.folderId !== dto.targetFolderId,
      );
      if (linksToMove.length === 0) {
        return { movedCount: 0, targetFolderId: folder.id };
      }

      const oldFolderIds = [...new Set(linksToMove.map((link) => link.folderId))];
      const oldFolders = await manager.getRepository(DocumentFolder).find({
        where: { id: In(oldFolderIds) },
      });
      const oldFolderNames = new Map(
        oldFolders.map((oldFolder) => [oldFolder.id, oldFolder.folderName]),
      );
      const documentById = new Map(documents.map((document) => [document.id, document]));

      await manager.query(
        `
          UPDATE folder_documents
          SET folder_id = $1, linked_at = NOW(), linked_by = $2
          WHERE document_id = ANY($3::uuid[])
        `,
        [dto.targetFolderId, actor.id, linksToMove.map((link) => link.documentId)],
      );

      for (const link of linksToMove) {
        const document = documentById.get(link.documentId)!;
        await this.auditService.recordEntityChange(manager, {
          aggregateType: AGGREGATE_TYPE,
          aggregateId: document.id,
          actorId: actor.id,
          actorRole: actor.roleCode,
          targetLabel: document.title,
          eventType: AuditEventType.UPDATED,
          changes: [
            {
              fieldName: 'folder',
              oldValue: oldFolderNames.get(link.folderId) ?? link.folderId,
              newValue: folder.folderName,
            },
          ],
        });
      }

      return { movedCount: linksToMove.length, targetFolderId: folder.id };
    });
  }

  private async assertFolderExists(folderId: string): Promise<DocumentFolder> {
    const folder = await this.folderRepo.findOne({ where: { id: folderId } });
    if (!folder)
      throw new NotFoundException('Không tìm thấy thư mục tài liệu.');
    return folder;
  }

  private async assertDocumentExists(
    documentId: string,
    mustBeActive = false,
  ): Promise<Document> {
    const where = mustBeActive
      ? { id: documentId, archivedAt: IsNull() }
      : { id: documentId };
    const document = await this.documentRepo.findOne({ where });
    if (!document)
      throw new NotFoundException('Không tìm thấy tài liệu trong kho.');
    return document;
  }

  private async validateUploadedObject(
    objectKey: string,
    requiredScope: string,
    fileName: string,
    mimeType: string,
    declaredSize: number,
  ): Promise<number> {
    assertAllowedFile(fileName, mimeType, declaredSize);
    if (!isObjectKeyInScope(objectKey, requiredScope)) {
      throw new BadRequestException(
        'objectKey không thuộc phạm vi tải lên này, vui lòng lấy lại link upload.',
      );
    }

    const head = await this.storage.headObject(objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Tệp chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }
    const actualSize = head.sizeBytes ?? declaredSize;
    if (actualSize > DEFAULT_MAX_UPLOAD_SIZE_BYTES) {
      await this.storage.deleteObject(objectKey);
      throw new BadRequestException(
        `Dung lượng tệp vượt quá giới hạn ${(DEFAULT_MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB.`,
      );
    }

    const ext = extname(fileName).toLowerCase();
    const sample = TEXT_EXTENSIONS_SCANNED_IN_FULL.has(ext)
      ? await this.storage.getObjectBuffer(objectKey)
      : await this.storage.getObjectHead(objectKey, MAGIC_BYTES_SAMPLE_SIZE);
    try {
      validateFileMagicBytes(ext, sample);
    } catch (error) {
      await this.storage.deleteObject(objectKey);
      throw error;
    }
    return actualSize;
  }

  private toVersionItem(
    version: DocumentVersion,
    isCurrent: boolean,
  ): DocumentVersionListItem {
    return {
      versionId: version.id,
      versionNo: version.versionNo,
      fileName: version.originalFileName,
      mimeType: version.mimeType,
      byteSize: Number(version.byteSize),
      uploadedAt: version.uploadedAt,
      uploadedBy: version.uploadedBy,
      changeReason: version.changeReason,
      isCurrent,
    };
  }
}
