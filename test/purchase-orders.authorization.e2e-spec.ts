import {
  ExecutionContext,
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PurchaseOrderFullAccessGuard } from '../src/common/guards/purchase-order-full-access.guard';
import { PurchaseOrder } from '../src/features/purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderWriteAccessGuard } from '../src/features/purchase-orders/guards/purchase-order-write-access.guard';
import { PurchaseOrdersController } from '../src/features/purchase-orders/purchase-orders.controller';
import { PurchaseOrdersService } from '../src/features/purchase-orders/purchase-orders.service';
import { Style } from '../src/features/styles/entities/Style.entity';
import { StorageController } from '../src/features/storage/storage.controller';
import { PurchaseOrderUploadWriteAccessGuard } from '../src/features/storage/guards/purchase-order-upload-write-access.guard';
import { PurchaseOrderDownloadAccessGuard } from '../src/features/storage/guards/purchase-order-download-access.guard';
import { STORAGE_SERVICE } from '../src/features/storage/storage.interface';

describe('Purchase-order write access mode (e2e)', () => {
  const purchaseOrdersService = {
    create: jest.fn(),
    findOne: jest.fn(),
    getProductSampleImageDownloadUrl: jest
      .fn()
      .mockResolvedValue({ url: 'https://s3.test/sample-image' }),
  };
  const storageService = {
    getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.test/download'),
  };
  const styleRepository = { exist: jest.fn().mockResolvedValue(true) };
  const purchaseOrderRepository = { exist: jest.fn().mockResolvedValue(true) };
  const poId = '11111111-1111-4111-8111-111111111111';
  let currentUser: {
    id: string;
    email: string;
    roleCode: string;
    permissions: string[];
    purchaseOrderMode: 'READ_ONLY' | 'FULL_ACCESS';
  };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    currentUser = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'sa@tami.test',
      roleCode: 'SA',
      permissions: ['management.area.access'],
      purchaseOrderMode: 'READ_ONLY',
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PurchaseOrdersController, StorageController],
      providers: [
        PurchaseOrderWriteAccessGuard,
        PurchaseOrderFullAccessGuard,
        PurchaseOrderDownloadAccessGuard,
        { provide: PurchaseOrdersService, useValue: purchaseOrdersService },
        PurchaseOrderUploadWriteAccessGuard,
        { provide: STORAGE_SERVICE, useValue: storageService },
        { provide: getRepositoryToken(Style), useValue: styleRepository },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: purchaseOrderRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => app.close());

  it('allows a read-only SA account to read a PO', async () => {
    const po = { id: poId, poCode: 'PO-2026-001' };
    purchaseOrdersService.findOne.mockResolvedValue(po);

    await request(app.getHttpServer())
      .get(`/purchase-orders/${poId}`)
      .expect(200)
      .expect(po);
  });

  it('denies PO writes to an SA account in read-only mode', async () => {
    await request(app.getHttpServer())
      .post('/purchase-orders')
      .send({})
      .expect(403);

    expect(purchaseOrdersService.create).not.toHaveBeenCalled();
  });

  it('allows PO writes to an SA account in full-access mode', async () => {
    currentUser.purchaseOrderMode = 'FULL_ACCESS';

    await request(app.getHttpServer())
      .post('/purchase-orders')
      .send({})
      .expect(400);

    expect(purchaseOrdersService.create).not.toHaveBeenCalled();
  });

  it('keeps every management-only non-SA account read-only', async () => {
    currentUser.roleCode = 'TPKH';
    currentUser.purchaseOrderMode = 'FULL_ACCESS';

    await request(app.getHttpServer())
      .post('/purchase-orders')
      .send({})
      .expect(403);
  });

  it('preserves existing PO write behavior for non-management roles', async () => {
    currentUser.roleCode = 'TPKH';
    currentUser.permissions = [];

    await request(app.getHttpServer())
      .post('/purchase-orders')
      .send({})
      .expect(400);
  });

  it('applies the write-mode guard to every non-GET controller route', () => {
    const prototype = PurchaseOrdersController.prototype;
    const writeHandlers = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => ({
        name,
        handler: prototype[name as keyof typeof prototype],
      }))
      .filter(({ handler }) => {
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        const path = Reflect.getMetadata(PATH_METADATA, handler);
        return path !== undefined && method !== RequestMethod.GET;
      });

    expect(writeHandlers.length).toBeGreaterThan(0);
    for (const { name, handler } of writeHandlers) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toContain(PurchaseOrderWriteAccessGuard);
      expect(name).toBeTruthy();
    }
  });

  it('applies the PO write-mode guard to the generic upload presign route', () => {
    const presignUpload = Reflect.getMetadata(
      PATH_METADATA,
      StorageController.prototype.presignUpload,
    );
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      StorageController.prototype.presignUpload,
    ) as unknown[];

    expect(presignUpload).toBe('presign');
    expect(guards).toContain(PurchaseOrderUploadWriteAccessGuard);
  });

  it('applies the conditional PO download guard to generic file URLs', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      StorageController.prototype.getViewUrl,
    ) as unknown[];

    expect(guards).toContain(PurchaseOrderDownloadAccessGuard);
  });

  it('applies the full-access guard to sample image download URLs', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      PurchaseOrdersController.prototype.getProductSampleImageDownloadUrl,
    ) as unknown[];

    expect(guards).toContain(PurchaseOrderFullAccessGuard);
  });

  it('denies attachment download URLs for PO files in read-only mode but keeps previews available', async () => {
    const objectKey = `purchase-orders/${poId}/documents/tech_pack/file.pdf`;

    await request(app.getHttpServer())
      .get('/storage/uploads/view-url')
      .query({ objectKey, download: 'true' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/storage/uploads/view-url')
      .query({ objectKey })
      .expect(200);

    expect(storageService.getPresignedGetUrl).toHaveBeenCalledTimes(1);
    expect(storageService.getPresignedGetUrl).toHaveBeenCalledWith(
      objectKey,
      expect.any(Number),
      undefined,
    );
  });

  it('preserves PO and Fit file downloads while SA has full access', async () => {
    currentUser.purchaseOrderMode = 'FULL_ACCESS';
    const poObjectKey = `purchase-orders/${poId}/documents/tech_pack/file.pdf`;

    await request(app.getHttpServer())
      .get('/storage/uploads/view-url')
      .query({ objectKey: poObjectKey, download: 'true' })
      .expect(200);

    currentUser.purchaseOrderMode = 'READ_ONLY';
    await request(app.getHttpServer())
      .get('/storage/uploads/view-url')
      .query({
        objectKey:
          'styles/33333333-3333-4333-8333-333333333333/documents/file.pdf',
        download: 'true',
      })
      .expect(200);
  });

  it('preserves PO downloads for users outside the management area', async () => {
    currentUser.roleCode = 'NVKH';
    currentUser.permissions = [];

    await request(app.getHttpServer())
      .get('/storage/uploads/view-url')
      .query({
        objectKey: `purchase-orders/${poId}/documents/tech_pack/file.pdf`,
        download: 'true',
      })
      .expect(200);
  });

  it('denies sample-round image download URLs to read-only SA accounts', async () => {
    await request(app.getHttpServer())
      .get(
        `/purchase-orders/${poId}/products/22222222-2222-4222-8222-222222222222/sample-rounds/44444444-4444-4444-8444-444444444444/images/55555555-5555-4555-8555-555555555555/download-url`,
      )
      .expect(403);

    expect(
      purchaseOrdersService.getProductSampleImageDownloadUrl,
    ).not.toHaveBeenCalled();
  });
});
