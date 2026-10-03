import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DocumentsService } from './documents.service';
import { Document } from './entities/Document.entity';
import { DocumentFolder } from './entities/DocumentFolder.entity';
import { DocumentVersion } from './entities/DocumentVersion.entity';
import { FolderDocument } from './entities/FolderDocument.entity';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { AuditService } from '../audit/audit.service';
import { UploadStatus } from '../../common/enums/database.enums';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let documentRepo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let documentQuery: Record<string, jest.Mock>;
  let documentCountQuery: Record<string, jest.Mock>;
  let versionRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let folderRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
  };
  let folderQuery: Record<string, jest.Mock>;
  let folderDocumentRepo: {
    find: jest.Mock;
    count: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let storage: jest.Mocked<StorageService>;
  let managerDocumentRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
  };
  let managerFolderRepo: {
    findOne: jest.Mock;
    count: jest.Mock;
    remove: jest.Mock;
  };
  let managerFolderDocumentRepo: {
    find: jest.Mock;
    delete: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let auditService: { recordEntityChange: jest.Mock };

  beforeEach(async () => {
    documentQuery = {};
    for (const method of [
      'innerJoin',
      'leftJoin',
      'where',
      'andWhere',
      'setParameter',
      'select',
      'addSelect',
      'orderBy',
      'addOrderBy',
      'offset',
      'limit',
    ]) {
      documentQuery[method] = jest.fn().mockReturnValue(documentQuery);
    }
    documentCountQuery = {};
    for (const method of ['select', 'addSelect']) {
      documentCountQuery[method] = jest
        .fn()
        .mockReturnValue(documentCountQuery);
    }
    documentCountQuery.getRawOne = jest
      .fn()
      .mockResolvedValue({ total: '0', totalBytes: '0' });
    documentQuery.clone = jest.fn().mockReturnValue(documentCountQuery);
    documentQuery.getRawMany = jest.fn().mockResolvedValue([]);
    documentRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(documentQuery),
    };
    versionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => ({ id: 'version-2', ...value })),
      findOne: jest.fn().mockResolvedValue({ versionNo: 1 }),
    };
    folderQuery = {};
    for (const method of [
      'leftJoin',
      'select',
      'addSelect',
      'groupBy',
      'addGroupBy',
      'orderBy',
      'andWhere',
    ]) {
      folderQuery[method] = jest.fn().mockReturnValue(folderQuery);
    }
    folderQuery.getRawMany = jest.fn().mockResolvedValue([
      {
        id: 'folder-1',
        parentId: null,
        folderName: 'Mẫu hè',
        parentFolderName: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        documentCount: '3',
        childCount: '2',
      },
    ]);
    folderRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(folderQuery),
      findOne: jest.fn(),
      save: jest.fn((value) => value),
      count: jest.fn().mockResolvedValue(0),
    };
    folderDocumentRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
      delete: jest.fn(),
    };
    storage = {
      getPresignedPutUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      getPresignedGetUrl: jest.fn(),
      deleteObject: jest.fn(),
      copyObject: jest.fn(),
      headObject: jest.fn().mockResolvedValue({ exists: true, sizeBytes: 100 }),
      getObjectHead: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.5')),
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('')),
      isTrustedObjectHost: jest.fn().mockReturnValue(true),
    };
    const document = {
      id: 'document-1',
      title: 'spec.pdf',
      currentVersionId: 'version-1',
      archivedAt: null,
    };
    documentRepo.findOne.mockResolvedValue(document);
    managerDocumentRepo = {
      findOne: jest.fn().mockResolvedValue(document),
      find: jest.fn().mockResolvedValue([document]),
      save: jest.fn((value) => value),
    };
    managerFolderRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'folder-1',
        folderName: 'Mẫu hè',
      }),
      count: jest.fn().mockResolvedValue(0),
      remove: jest.fn(),
    };
    managerFolderDocumentRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          { folderId: 'folder-1', documentId: 'document-1' },
        ]),
      delete: jest.fn(),
    };
    const transactionManager = {
      getRepository: (entity: unknown) => {
        if (entity === Document) return managerDocumentRepo;
        if (entity === DocumentVersion) return versionRepo;
        if (entity === DocumentFolder) return managerFolderRepo;
        if (entity === FolderDocument) return managerFolderDocumentRepo;
        throw new Error(
          `Unexpected entity ${(entity as { name?: string }).name}`,
        );
      },
    };
    dataSource = {
      transaction: jest.fn((callback: (manager: any) => unknown) =>
        callback(transactionManager),
      ),
    };
    auditService = { recordEntityChange: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: getRepositoryToken(Document), useValue: documentRepo },
        { provide: getRepositoryToken(DocumentVersion), useValue: versionRepo },
        { provide: getRepositoryToken(DocumentFolder), useValue: folderRepo },
        {
          provide: getRepositoryToken(FolderDocument),
          useValue: folderDocumentRepo,
        },
        { provide: getRepositoryToken(StyleDocument), useValue: {} },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  it('returns only root folders by default with numeric counts and child flags', async () => {
    const result = await service.listFolders();

    expect(folderRepo.createQueryBuilder).toHaveBeenCalledWith('folder');
    expect(folderQuery.leftJoin).toHaveBeenCalledWith(
      Document,
      'document',
      'document.id = folderDocument.documentId AND document.archivedAt IS NULL',
    );
    expect(folderQuery.andWhere).toHaveBeenCalledWith(
      'folder.parentId IS NULL',
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'folder-1',
        documentCount: 3,
        hasChildren: true,
        parentFolderName: null,
      }),
    ]);
  });

  it('rejects moving a folder into one of its descendants', async () => {
    const root = { id: 'folder-a', parentId: null, folderName: 'A' };
    const child = { id: 'folder-b', parentId: 'folder-a', folderName: 'B' };
    folderRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(where.id === root.id ? root : child),
    );

    await expect(
      service.renameFolder('folder-a', {
        folderName: 'A',
        parentId: 'folder-b',
      }),
    ).rejects.toThrow(
      'Không thể di chuyển thư mục vào bên trong cây con của chính nó.',
    );
    expect(folderRepo.save).not.toHaveBeenCalled();
  });

  it('deletes a folder and archives documents that are only linked to it', async () => {
    const document = {
      id: 'document-1',
      title: 'spec.pdf',
      archivedAt: null,
    };
    managerDocumentRepo.find.mockResolvedValue([document]);

    await service.deleteFolder('folder-1', {
      id: 'user-1',
      roleCode: 'MANAGER',
    });

    expect(managerFolderDocumentRepo.delete).toHaveBeenCalledWith({
      folderId: 'folder-1',
    });
    expect(document.archivedAt).toBeInstanceOf(Date);
    expect(managerDocumentRepo.save).toHaveBeenCalledWith(document);
    expect(managerFolderRepo.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'folder-1' }),
    );
    expect(auditService.recordEntityChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ aggregateId: 'document-1' }),
    );
  });

  it('keeps a document active when it is still linked to another folder', async () => {
    managerFolderDocumentRepo.find.mockResolvedValue([
      { folderId: 'folder-1', documentId: 'document-1' },
      { folderId: 'folder-2', documentId: 'document-1' },
    ]);

    await service.deleteFolder('folder-1');

    expect(managerFolderDocumentRepo.delete).toHaveBeenCalledWith({
      folderId: 'folder-1',
    });
    expect(managerDocumentRepo.find).not.toHaveBeenCalled();
    expect(managerDocumentRepo.save).not.toHaveBeenCalled();
    expect(managerFolderRepo.remove).toHaveBeenCalled();
  });

  it('does not delete a folder that still has child folders', async () => {
    managerFolderRepo.count.mockResolvedValue(1);

    await expect(service.deleteFolder('folder-1')).rejects.toThrow(
      'Không thể xóa thư mục vì đang chứa thư mục con.',
    );
    expect(managerFolderDocumentRepo.delete).not.toHaveBeenCalled();
    expect(managerFolderRepo.remove).not.toHaveBeenCalled();
  });

  it('lists active documents by default and can filter archived documents', async () => {
    await service.list({});
    expect(documentQuery.where).toHaveBeenLastCalledWith(
      'document.archivedAt IS NULL',
    );

    await service.list({ archived: 'true' });
    expect(documentQuery.where).toHaveBeenLastCalledWith(
      'document.archivedAt IS NOT NULL',
    );
  });

  it('paginates the filtered library on the server and returns total metadata', async () => {
    documentCountQuery.getRawOne.mockResolvedValue({
      total: '27',
      totalBytes: '98765',
    });

    const result = await service.list({
      page: 2,
      limit: 10,
      category: 'pdf',
      sortOrder: 'oldest',
    });

    expect(documentQuery.andWhere).toHaveBeenCalledWith(
      'LOWER(version.originalFileName) ~ :categoryPattern',
      { categoryPattern: String.raw`\.pdf$` },
    );
    expect(documentQuery.innerJoin).toHaveBeenCalledWith(
      FolderDocument,
      'folderDocument',
      'folderDocument.documentId = document.id',
      undefined,
    );
    expect(documentQuery.orderBy).toHaveBeenCalledWith(
      'version.uploadedAt',
      'ASC',
    );
    expect(documentQuery.offset).toHaveBeenCalledWith(10);
    expect(documentQuery.limit).toHaveBeenCalledWith(10);
    expect(documentQuery.getRawMany).toHaveBeenCalled();
    expect(result.meta).toEqual({
      total: 27,
      totalBytes: 98765,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
  });

  it('filters assigned documents by the Fit attachment purpose', async () => {
    await service.list({ assigned: 'true' });

    expect(documentQuery.andWhere).toHaveBeenCalledWith(
      'EXISTS (SELECT 1 FROM style_documents assignedDocument WHERE assignedDocument.document_id = document.id AND assignedDocument.purpose = :fitAttachmentPurpose)',
      { fitAttachmentPurpose: 'fit_attachment' },
    );
  });

  it('filters processing documents that are not assigned to a Fit style', async () => {
    await service.list({ assigned: 'false' });

    expect(documentQuery.andWhere).toHaveBeenCalledWith(
      'NOT EXISTS (SELECT 1 FROM style_documents assignedDocument WHERE assignedDocument.document_id = document.id AND assignedDocument.purpose = :fitAttachmentPurpose)',
      { fitAttachmentPurpose: 'fit_attachment' },
    );
  });

  it('searches across folder names and includes the parent folder name', async () => {
    await service.listFolders({ search: ' mùa ' });

    expect(folderQuery.andWhere).toHaveBeenCalledWith(
      'folder.folderName ILIKE :search',
      { search: '%mùa%' },
    );
    expect(folderQuery.andWhere).not.toHaveBeenCalledWith(
      'folder.parentId IS NULL',
    );
  });

  it('returns direct children when a parent folder is selected', async () => {
    await service.listFolders({ parentId: 'folder-1' });

    expect(folderQuery.andWhere).toHaveBeenCalledWith(
      'folder.parentId = :parentId',
      { parentId: 'folder-1' },
    );
  });

  it('creates the next version and advances the current-version pointer atomically', async () => {
    const result = await service.confirmVersionUpload(
      'document-1',
      {
        objectKey: 'documents/library/document-1/versions/v2.pdf',
        fileName: 'spec-v2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 80,
        changeReason: '  cập nhật thông số  ',
      },
      'user-1',
      { id: 'user-1', roleCode: 'TPKH' },
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(managerDocumentRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'document-1', archivedAt: expect.anything() },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(versionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'document-1',
        versionNo: 2,
        originalFileName: 'spec-v2.pdf',
        byteSize: 100,
        changeReason: 'cập nhật thông số',
        uploadedBy: 'user-1',
        status: UploadStatus.READY,
      }),
    );
    expect(managerDocumentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ currentVersionId: 'version-2' }),
    );
    expect(result).toMatchObject({
      versionId: 'version-2',
      versionNo: 2,
      fileName: 'spec-v2.pdf',
      isCurrent: true,
    });
  });

  it('rejects a version confirmation with an object key outside that document', async () => {
    await expect(
      service.confirmVersionUpload(
        'document-1',
        {
          objectKey: 'documents/library/another-document/versions/v2.pdf',
          fileName: 'spec-v2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 80,
        },
        'user-1',
      ),
    ).rejects.toThrow('objectKey không thuộc phạm vi tải lên này');
    expect(storage.headObject).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
