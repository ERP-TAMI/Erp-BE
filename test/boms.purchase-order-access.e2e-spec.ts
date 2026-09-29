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
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { BomType } from '../src/common/enums/database.enums';
import { Bom } from '../src/features/boms/entities/Bom.entity';
import { BomAggregateService } from '../src/features/boms/bom-aggregate.service';
import { BomsController } from '../src/features/boms/boms.controller';
import { BomsService } from '../src/features/boms/boms.service';
import { PurchaseOrderBomWriteAccessGuard } from '../src/features/boms/guards/purchase-order-bom-write-access.guard';

describe('PO BOM write access mode (e2e)', () => {
  const bomId = '11111111-1111-4111-8111-111111111111';
  const bomsService = {
    create: jest.fn().mockResolvedValue({ id: bomId, type: BomType.PO }),
    update: jest.fn().mockResolvedValue({ id: bomId, deadline: '2026-10-01' }),
    discontinue: jest
      .fn()
      .mockResolvedValue({ id: bomId, status: 'discontinued' }),
  };
  const bomRepository = {
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, bomType: currentBomType }),
      ),
  };
  let currentBomType: BomType;
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
    currentBomType = BomType.PO;
    currentUser = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'sa@tami.test',
      roleCode: 'SA',
      permissions: ['management.area.access'],
      purchaseOrderMode: 'READ_ONLY',
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [BomsController],
      providers: [
        PurchaseOrderBomWriteAccessGuard,
        { provide: BomsService, useValue: bomsService },
        { provide: BomAggregateService, useValue: {} },
        { provide: getRepositoryToken(Bom), useValue: bomRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = currentUser;
          return true;
        },
      })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
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

  it('denies direct header updates and discontinue requests for a PO BOM in read-only mode', async () => {
    await request(app.getHttpServer())
      .patch(`/boms/${bomId}`)
      .send({ deadline: '2026-10-01' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/boms/${bomId}/discontinue`)
      .send({ reason: 'Test cancellation', expectedRowVersion: 1 })
      .expect(403);

    expect(bomsService.update).not.toHaveBeenCalled();
    expect(bomsService.discontinue).not.toHaveBeenCalled();
  });

  it('lets the route UUID pipe reject malformed IDs before querying the BOM', async () => {
    await request(app.getHttpServer())
      .patch('/boms/not-a-uuid')
      .send({ deadline: '2026-10-01' })
      .expect(400);

    expect(bomRepository.findOne).not.toHaveBeenCalled();
    expect(bomsService.update).not.toHaveBeenCalled();
  });

  it('denies creation of a PO BOM in read-only mode before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/boms')
      .send({ type: BomType.PO })
      .expect(403);

    expect(bomsService.create).not.toHaveBeenCalled();
  });

  it('allows PO BOM mutations for SA in full-access mode', async () => {
    currentUser.purchaseOrderMode = 'FULL_ACCESS';

    await request(app.getHttpServer())
      .patch(`/boms/${bomId}`)
      .send({ deadline: '2026-10-01' })
      .expect(200);

    expect(bomsService.update).toHaveBeenCalled();
  });

  it('preserves existing SA permissions for Fit BOMs in read-only PO mode', async () => {
    currentBomType = BomType.FIT;

    await request(app.getHttpServer())
      .patch(`/boms/${bomId}`)
      .send({ deadline: '2026-10-01' })
      .expect(200);

    expect(bomsService.update).toHaveBeenCalled();
  });

  it('preserves PO BOM writes for roles outside the management area', async () => {
    currentUser.roleCode = 'NVKH';
    currentUser.permissions = [];

    await request(app.getHttpServer())
      .patch(`/boms/${bomId}`)
      .send({ deadline: '2026-10-01' })
      .expect(200);

    expect(bomsService.update).toHaveBeenCalled();
  });

  it('guards every BOM write route so PO subresources cannot bypass the mode', () => {
    const prototype = BomsController.prototype;
    const writeHandlers = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => ({
        handler: prototype[name as keyof typeof prototype],
      }))
      .filter(({ handler }) => {
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        const path = Reflect.getMetadata(PATH_METADATA, handler);
        return path !== undefined && method !== RequestMethod.GET;
      });

    expect(writeHandlers.length).toBeGreaterThan(0);
    for (const { handler } of writeHandlers) {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toContain(PurchaseOrderBomWriteAccessGuard);
    }
  });
});
