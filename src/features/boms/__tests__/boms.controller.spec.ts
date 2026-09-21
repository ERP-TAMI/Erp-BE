import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { BomsController } from '../boms.controller';
import { BomsService } from '../boms.service';
import { BomAggregateService } from '../bom-aggregate.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import {
  BomRevisionStatus,
  BomType,
} from '../../../common/enums/database.enums';

describe('BomsController (HTTP API & Role Masking)', () => {
  let app: INestApplication;
  let bomsServiceMock: any;
  let bomAggregateServiceMock: any;
  let currentUser: any = { id: 'u-1', roleCode: 'SA' };

  beforeEach(async () => {
    bomsServiceMock = {
      findAll: jest.fn().mockImplementation((query, roleCode) => {
        const isCostVisible = ['SA', 'TPKH', 'ACCOUNTING'].includes(
          roleCode?.toUpperCase(),
        );
        return Promise.resolve({
          data: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              bomCode: 'BOM-SP26-001',
              type: BomType.PO,
              status: BomRevisionStatus.WAIT_ACCOUNTING,
              costPerUnit: isCostVisible ? 55 : null,
              currentOrderQuantity: 200,
              currentOrderCost: isCostVisible ? 11000 : null,
              colorNameSnapshot: null,
            },
          ],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        });
      }),
      findOne: jest.fn().mockImplementation((id, roleCode) => {
        const isCostVisible = ['SA', 'TPKH', 'ACCOUNTING'].includes(
          roleCode?.toUpperCase(),
        );
        return Promise.resolve({
          id,
          bomCode: 'BOM-SP26-001',
          type: BomType.PO,
          status: BomRevisionStatus.WAIT_ACCOUNTING,
          costPerUnit: isCostVisible ? 55 : null,
          currentOrderQuantity: 200,
          currentOrderCost: isCostVisible ? 11000 : null,
          lines: [
            {
              id: 'line-1',
              materialNameSnapshot: 'Cotton 100%',
              consumption: 2,
              unitCost: isCostVisible ? 27.5 : null,
              lineCost: isCostVisible ? 55 : null,
              orderIndex: 0,
            },
          ],
        });
      }),
      getStats: jest.fn().mockResolvedValue({
        total: 10,
        draftCount: 2,
        pendingCount: 5,
        approvedCount: 3,
        discontinuedCount: 0,
        byStatus: {
          wait_nvkh: 2,
          wait_rd: 2,
          wait_tpkh_confirm: 1,
          wait_accounting: 1,
          wait_sa_approve: 1,
          closed: 3,
          discontinued: 0,
        },
      }),
      create: jest.fn().mockImplementation((dto) => {
        return Promise.resolve({
          id: '123e4567-e89b-12d3-a456-426614174000',
          bomCode: dto.type === BomType.FIT ? 'BOM-FIT-ST01' : 'BOM-PO01-P01',
          type: dto.type,
          status: BomRevisionStatus.WAIT_NVKH,
          currentRevisionId: 'rev-1',
        });
      }),
      update: jest.fn().mockImplementation((id, dto) => {
        return Promise.resolve({
          id,
          bomCode: 'BOM-FIT-ST01',
          deadline: dto.deadline,
          rdNote: dto.rdNote,
        });
      }),
      discontinue: jest.fn().mockImplementation((id, dto) => {
        return Promise.resolve({
          id,
          status: 'discontinued',
          discontinuedReason: dto.reason,
          discontinuedAt: new Date(),
        });
      }),
      addLine: jest.fn().mockImplementation((bomId, dto) => {
        return Promise.resolve({
          id: '123e4567-e89b-12d3-a456-426614174099',
          revisionId: '123e4567-e89b-12d3-a456-426614174001',
          materialId: dto.materialId,
          materialNameSnapshot: 'Cotton 100%',
          materialGroupId: 'group-1',
          materialGroupSnapshot: 'Vải chính',
          unitId: 'unit-1',
          unitSnapshot: 'Mét',
          consumption: dto.consumption,
          unitCost: null,
          lineCost: null,
          note: dto.note ?? null,
          orderIndex: dto.orderIndex ?? 0,
        });
      }),
      updateLine: jest.fn().mockImplementation((bomId, lineId, dto) => {
        return Promise.resolve({
          id: lineId,
          revisionId: '123e4567-e89b-12d3-a456-426614174001',
          materialId: dto.materialId || '123e4567-e89b-12d3-a456-426614174002',
          materialNameSnapshot: 'Cotton 100%',
          consumption: dto.consumption || 1.5,
          unitCost: dto.unitCost ?? null,
          note: dto.note ?? null,
          orderIndex: dto.orderIndex ?? 0,
        });
      }),
      deleteLine: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          success: true,
          message: 'Đã xóa dòng vật tư thành công.',
        });
      }),
      reorderLines: jest.fn().mockImplementation((bomId, dto) => {
        return Promise.resolve(
          dto.items.map((item: any) => ({
            id: item.lineId,
            orderIndex: item.orderIndex,
          })),
        );
      }),
      forward: jest.fn().mockImplementation((id) => {
        return Promise.resolve({
          id,
          bomCode: 'BOM-SP26-001',
          status: BomRevisionStatus.WAIT_RD,
        });
      }),
      reject: jest.fn().mockImplementation((id, dto) => {
        return Promise.resolve({
          id,
          bomCode: 'BOM-SP26-001',
          status: dto.targetStatus,
        });
      }),
      approve: jest.fn().mockImplementation((id) => {
        return Promise.resolve({
          id,
          bomCode: 'BOM-SP26-001',
          status: BomRevisionStatus.CLOSED,
        });
      }),
      createRevision: jest.fn().mockImplementation((id, dto) => {
        return Promise.resolve({
          id,
          bomCode: 'BOM-SP26-001',
          status: BomRevisionStatus.WAIT_NVKH,
          currentRevision: {
            revisionNo: 2,
            status: BomRevisionStatus.WAIT_NVKH,
            changeReason: dto.reason,
          },
        });
      }),
      getRevisions: jest.fn().mockImplementation((bomId) => {
        return Promise.resolve([
          {
            id: 'rev-2',
            bomId,
            revisionNo: 2,
            status: BomRevisionStatus.WAIT_NVKH,
            isCurrent: true,
          },
          {
            id: 'rev-1',
            bomId,
            revisionNo: 1,
            status: BomRevisionStatus.CLOSED,
            isCurrent: false,
          },
        ]);
      }),
      getRevisionDetail: jest.fn().mockImplementation((bomId, revisionId) => {
        return Promise.resolve({
          id: revisionId,
          bomId,
          revisionNo: 1,
          status: BomRevisionStatus.CLOSED,
          lines: [],
          costPerUnit: 100,
        });
      }),
      getRevisionHistory: jest.fn().mockImplementation((_bomId, revisionId) => {
        return Promise.resolve([
          {
            id: 'hist-1',
            revisionId,
            action: 'approve',
            newStatus: BomRevisionStatus.CLOSED,
          },
        ]);
      }),
      getRevisionDiff: jest.fn().mockImplementation((bomId, revisionId) => {
        return Promise.resolve({
          bomId,
          targetRevisionId: revisionId,
          targetRevisionNo: 2,
          baseRevisionId: 'rev-1',
          baseRevisionNo: 1,
          totalAdded: 1,
          totalRemoved: 0,
          totalChanged: 1,
          totalUnchanged: 0,
          items: [],
        });
      }),
      copyFromFit: jest.fn().mockImplementation((id, dto) => {
        return Promise.resolve({
          id,
          bomCode: 'BOM-PO01-P01',
          type: BomType.PO,
          status: BomRevisionStatus.WAIT_NVKH,
          currentRevision: {
            id: 'rev-1',
            revisionNo: 1,
            status: BomRevisionStatus.WAIT_NVKH,
            sourceRevisionId: dto?.sourceRevisionId || 'source-rev-uuid',
          },
          costPerUnit: null,
          currentOrderQuantity: 200,
          currentOrderCost: null,
          lines: [
            {
              id: 'line-new-1',
              materialNameSnapshot: 'Cotton 100%',
              consumption: 2,
              unitCost: null,
              lineCost: null,
              orderIndex: 0,
            },
          ],
        });
      }),
    };

    bomAggregateServiceMock = {
      aggregate: jest.fn().mockImplementation((query, userRole) => {
        const isCostVisible = ['SA', 'TPKH', 'ACCOUNTING'].includes(userRole);
        return Promise.resolve({
          data: [
            {
              materialId: 'mat-1',
              materialNameSnapshot: 'Vải Cotton 100% 220gsm',
              materialGroupSnapshot: 'Vải chính',
              unitSnapshot: 'Mét',
              totalRequiredQuantity: 2500,
              bomCount: 2,
              poProductCount: 2,
              unitCost: isCostVisible ? 120000 : null,
              totalEstimatedCost: isCostVisible ? 300000000 : null,
              costComplete: true,
              breakdown:
                query.breakdown === 'color'
                  ? [{ colorName: 'Đen', requiredQuantity: 2500 }]
                  : undefined,
            },
          ],
          meta: {
            total: 1,
            page: query.page || 1,
            limit: query.limit || 20,
            totalPages: 1,
          },
        });
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BomsController],
      providers: [
        {
          provide: BomsService,
          useValue: bomsServiceMock,
        },
        {
          provide: BomAggregateService,
          useValue: bomAggregateServiceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. GET /api/v1/boms (List)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/boms', () => {
    it('returns 200 with cost information when user is SA', async () => {
      currentUser = { id: 'sa-id', roleCode: 'SA' };

      const res = await request(app.getHttpServer())
        .get('/api/v1/boms')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].costPerUnit).toBe(55);
      expect(res.body.data[0].currentOrderCost).toBe(11000);
      expect(bomsServiceMock.findAll).toHaveBeenCalledWith(
        expect.any(Object),
        'SA',
      );
    });

    it('returns 200 with cost information when user is TPKH', async () => {
      currentUser = { id: 'tpkh-id', roleCode: 'TPKH' };

      const res = await request(app.getHttpServer())
        .get('/api/v1/boms')
        .expect(200);

      expect(res.body.data[0].costPerUnit).toBe(55);
      expect(res.body.data[0].currentOrderCost).toBe(11000);
      expect(bomsServiceMock.findAll).toHaveBeenCalledWith(
        expect.any(Object),
        'TPKH',
      );
    });

    it('returns 200 with cost information when user is ACCOUNTING', async () => {
      currentUser = { id: 'acct-id', roleCode: 'ACCOUNTING' };

      const res = await request(app.getHttpServer())
        .get('/api/v1/boms')
        .expect(200);

      expect(res.body.data[0].costPerUnit).toBe(55);
      expect(res.body.data[0].currentOrderCost).toBe(11000);
    });

    it('masks cost fields to null when user is NVKH', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .get('/api/v1/boms')
        .expect(200);

      expect(res.body.data[0].costPerUnit).toBeNull();
      expect(res.body.data[0].currentOrderCost).toBeNull();
      // currentOrderQuantity remains visible for planning
      expect(res.body.data[0].currentOrderQuantity).toBe(200);
    });

    it('masks cost fields to null when user is RD', async () => {
      currentUser = { id: 'rd-id', roleCode: 'RD' };

      const res = await request(app.getHttpServer())
        .get('/api/v1/boms')
        .expect(200);

      expect(res.body.data[0].costPerUnit).toBeNull();
      expect(res.body.data[0].currentOrderCost).toBeNull();
    });

    it('supports alias /boms', async () => {
      currentUser = { id: 'sa-id', roleCode: 'SA' };

      await request(app.getHttpServer()).get('/boms').expect(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. GET /api/v1/boms/stats
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/boms/stats', () => {
    it('returns 200 with status counts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/boms/stats')
        .expect(200);

      expect(res.body.total).toBe(10);
      expect(res.body.draftCount).toBe(2);
      expect(res.body.pendingCount).toBe(5);
      expect(res.body.approvedCount).toBe(3);
      expect(res.body.byStatus.closed).toBe(3);
    });

    it('supports alias /boms/stats', async () => {
      await request(app.getHttpServer()).get('/boms/stats').expect(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. GET /api/v1/boms/:id (Detail)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/boms/:id', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 200 with full costs and line unit_cost when user is TPKH', async () => {
      currentUser = { id: 'tpkh-id', roleCode: 'TPKH' };

      const res = await request(app.getHttpServer())
        .get(`/api/v1/boms/${validUuid}`)
        .expect(200);

      expect(res.body.id).toBe(validUuid);
      expect(res.body.costPerUnit).toBe(55);
      expect(res.body.currentOrderCost).toBe(11000);
      expect(res.body.lines[0].unitCost).toBe(27.5);
      expect(res.body.lines[0].lineCost).toBe(55);
    });

    it('masks header and line cost fields when user is NVKH', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .get(`/api/v1/boms/${validUuid}`)
        .expect(200);

      expect(res.body.id).toBe(validUuid);
      expect(res.body.costPerUnit).toBeNull();
      expect(res.body.currentOrderCost).toBeNull();
      expect(res.body.lines[0].unitCost).toBeNull();
      expect(res.body.lines[0].lineCost).toBeNull();
    });

    it('returns 400 when ID is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/boms/not-a-uuid')
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. POST /api/v1/boms (Create)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/v1/boms', () => {
    it('returns 201 when creating a valid FIT BOM', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .post('/api/v1/boms')
        .send({
          type: 'fit',
          styleId: '123e4567-e89b-12d3-a456-426614174000',
        })
        .expect(201);

      expect(res.body.bomCode).toBe('BOM-FIT-ST01');
      expect(res.body.type).toBe('fit');
      expect(bomsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'fit',
          styleId: '123e4567-e89b-12d3-a456-426614174000',
        }),
        'nvkh-id',
        'NVKH',
      );
    });

    it('returns 201 when creating a valid PO BOM', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .post('/api/v1/boms')
        .send({
          type: 'po',
          purchaseOrderProductId: '123e4567-e89b-12d3-a456-426614174001',
        })
        .expect(201);

      expect(res.body.bomCode).toBe('BOM-PO01-P01');
      expect(res.body.type).toBe('po');
    });

    it('returns 400 when type=fit but styleId is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boms')
        .send({
          type: 'fit',
        })
        .expect(400);
    });

    it('returns 400 when type=po but purchaseOrderProductId is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boms')
        .send({
          type: 'po',
        })
        .expect(400);
    });

    it('returns 400 when both styleId and purchaseOrderProductId are provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boms')
        .send({
          type: 'fit',
          styleId: '123e4567-e89b-12d3-a456-426614174000',
          purchaseOrderProductId: '123e4567-e89b-12d3-a456-426614174001',
        })
        .expect(400);
    });

    it('returns 400 when productColorId is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boms')
        .send({
          type: 'po',
          purchaseOrderProductId: '123e4567-e89b-12d3-a456-426614174001',
          productColorId: '123e4567-e89b-12d3-a456-426614174002',
        })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. PATCH /api/v1/boms/:id (Header update)
  // ──────────────────────────────────────────────────────────────────────────
  describe('PATCH /api/v1/boms/:id', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 200 when updating deadline as NVKH', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/boms/${validUuid}`)
        .send({
          deadline: '2026-10-01T00:00:00.000Z',
        })
        .expect(200);

      expect(res.body.id).toBe(validUuid);
      expect(bomsServiceMock.update).toHaveBeenCalledWith(
        validUuid,
        expect.objectContaining({
          deadline: '2026-10-01T00:00:00.000Z',
        }),
        'nvkh-id',
        'NVKH',
      );
    });

    it('returns 400 when ID is invalid UUID', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/boms/invalid-uuid')
        .send({ rdNote: 'Test' })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. POST /api/v1/boms/:id/discontinue
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/v1/boms/:id/discontinue', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 200 when discontinue with a valid reason', async () => {
      currentUser = { id: 'tpkh-id', roleCode: 'TPKH' };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${validUuid}/discontinue`)
        .send({
          reason: 'Client cancelled style production',
        })
        .expect(200);

      expect(res.body.status).toBe('discontinued');
      expect(res.body.discontinuedReason).toBe(
        'Client cancelled style production',
      );
      expect(bomsServiceMock.discontinue).toHaveBeenCalledWith(
        validUuid,
        { reason: 'Client cancelled style production' },
        'tpkh-id',
        'TPKH',
      );
    });

    it('returns 400 when reason is empty string', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validUuid}/discontinue`)
        .send({
          reason: '',
        })
        .expect(400);
    });

    it('returns 400 when reason is only whitespace', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validUuid}/discontinue`)
        .send({
          reason: '    ',
        })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. POST /api/v1/boms/:id/lines (Add Line)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/v1/boms/:id/lines', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';
    const validMaterialId = '123e4567-e89b-12d3-a456-426614174002';

    it('returns 201 when adding a line with valid data', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/lines`)
        .send({
          materialId: validMaterialId,
          consumption: 1.5,
          note: 'Collar fabric',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.materialId).toBe(validMaterialId);
      expect(res.body.consumption).toBe(1.5);
      expect(bomsServiceMock.addLine).toHaveBeenCalledWith(
        validBomId,
        expect.objectContaining({
          materialId: validMaterialId,
          consumption: 1.5,
        }),
        'nvkh-id',
        'NVKH',
      );
    });

    it('returns 400 when consumption < 0', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/lines`)
        .send({
          materialId: validMaterialId,
          consumption: -1,
        })
        .expect(400);
    });

    it('returns 400 when client sends materialNameSnapshot or unitCost', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/lines`)
        .send({
          materialId: validMaterialId,
          consumption: 1.0,
          materialNameSnapshot: 'Hacked name',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/lines`)
        .send({
          materialId: validMaterialId,
          consumption: 1.0,
          unitCost: 50000,
        })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. PUT /api/v1/boms/:id/lines/reorder (Reorder Lines)
  // ──────────────────────────────────────────────────────────────────────────
  describe('PUT /api/v1/boms/:id/lines/reorder', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';
    const lineId1 = '123e4567-e89b-12d3-a456-426614174001';
    const lineId2 = '123e4567-e89b-12d3-a456-426614174002';

    it('returns 200 when reordering lines', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .put(`/api/v1/boms/${validBomId}/lines/reorder`)
        .send({
          items: [
            { lineId: lineId1, orderIndex: 1 },
            { lineId: lineId2, orderIndex: 0 },
          ],
        })
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(bomsServiceMock.reorderLines).toHaveBeenCalled();
    });

    it('returns 400 when items array is empty', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/boms/${validBomId}/lines/reorder`)
        .send({ items: [] })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. PATCH /api/v1/boms/:id/lines/:lineId (Update Line)
  // ──────────────────────────────────────────────────────────────────────────
  describe('PATCH /api/v1/boms/:id/lines/:lineId', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';
    const validLineId = '123e4567-e89b-12d3-a456-426614174001';

    it('returns 200 when updating consumption', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/boms/${validBomId}/lines/${validLineId}`)
        .send({ consumption: 2.0 })
        .expect(200);

      expect(res.body.id).toBe(validLineId);
      expect(bomsServiceMock.updateLine).toHaveBeenCalledWith(
        validBomId,
        validLineId,
        expect.objectContaining({ consumption: 2.0 }),
        'nvkh-id',
        'NVKH',
      );
    });

    it('returns 400 when lineId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/boms/${validBomId}/lines/not-a-uuid`)
        .send({ consumption: 2.0 })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. DELETE /api/v1/boms/:id/lines/:lineId (Delete Line)
  // ──────────────────────────────────────────────────────────────────────────
  describe('DELETE /api/v1/boms/:id/lines/:lineId', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';
    const validLineId = '123e4567-e89b-12d3-a456-426614174001';

    it('returns 200 on successful line deletion', async () => {
      currentUser = { id: 'tpkh-id', roleCode: 'TPKH' };

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/boms/${validBomId}/lines/${validLineId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(bomsServiceMock.deleteLine).toHaveBeenCalledWith(
        validBomId,
        validLineId,
        'tpkh-id',
        'TPKH',
      );
    });

    it('returns 400 when lineId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/boms/${validBomId}/lines/not-a-uuid`)
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. POST /api/v1/boms/:id/forward (Workflow Forward)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/v1/boms/:id/forward', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 200 on successful forward transition', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/forward`)
        .send({ reason: 'Hoàn thành nấc N1' })
        .expect(200);

      expect(res.body.status).toBe(BomRevisionStatus.WAIT_RD);
      expect(bomsServiceMock.forward).toHaveBeenCalledWith(
        validBomId,
        expect.objectContaining({ reason: 'Hoàn thành nấc N1' }),
        'nvkh-id',
        'NVKH',
      );
    });

    it('returns 400 when BOM id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boms/invalid-uuid/forward')
        .send({})
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. POST /api/v1/boms/:id/reject (Workflow Reject)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/v1/boms/:id/reject', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 200 on successful reject transition', async () => {
      currentUser = { id: 'rd-id', roleCode: 'RD' };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/reject`)
        .send({
          targetStatus: BomRevisionStatus.WAIT_NVKH,
          reason: 'Yêu cầu kiểm tra lại định mức',
        })
        .expect(200);

      expect(res.body.status).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(bomsServiceMock.reject).toHaveBeenCalledWith(
        validBomId,
        expect.objectContaining({
          targetStatus: BomRevisionStatus.WAIT_NVKH,
          reason: 'Yêu cầu kiểm tra lại định mức',
        }),
        'rd-id',
        'RD',
      );
    });

    it('returns 400 when reason is empty or missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/reject`)
        .send({
          targetStatus: BomRevisionStatus.WAIT_NVKH,
          reason: '   ',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/reject`)
        .send({
          targetStatus: BomRevisionStatus.WAIT_NVKH,
        })
        .expect(400);
    });

    it('returns 400 when targetStatus is invalid', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/reject`)
        .send({
          targetStatus: 'invalid_status',
          reason: 'Some reason',
        })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 13. POST /api/v1/boms/:id/approve (Workflow Approve)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/v1/boms/:id/approve', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 200 on successful approve transition', async () => {
      currentUser = { id: 'sa-id', roleCode: 'SA' };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/approve`)
        .send({ reason: 'Phê duyệt đóng BOM' })
        .expect(200);

      expect(res.body.status).toBe(BomRevisionStatus.CLOSED);
      expect(bomsServiceMock.approve).toHaveBeenCalledWith(
        validBomId,
        expect.objectContaining({ reason: 'Phê duyệt đóng BOM' }),
        'sa-id',
        'SA',
      );
    });

    it('returns 400 when BOM id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boms/invalid-uuid/approve')
        .send({})
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 14. POST /api/v1/boms/:id/revisions (Create Revision)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/v1/boms/:id/revisions', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 201 on successful revision creation', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/revisions`)
        .send({ reason: 'Tạo revision 2 sau thử mẫu' })
        .expect(201);

      expect(res.body.currentRevision.revisionNo).toBe(2);
      expect(bomsServiceMock.createRevision).toHaveBeenCalledWith(
        validBomId,
        expect.objectContaining({ reason: 'Tạo revision 2 sau thử mẫu' }),
        'nvkh-id',
        'NVKH',
      );
    });

    it('returns 400 when reason is missing or empty', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/revisions`)
        .send({ reason: '' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validBomId}/revisions`)
        .send({})
        .expect(400);
    });

    it('returns 400 when BOM id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/boms/not-a-uuid/revisions')
        .send({ reason: 'Valid reason' })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 15. GET /api/v1/boms/:id/revisions (Revision List)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/boms/:id/revisions', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 200 with list of revisions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/boms/${validBomId}/revisions`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(bomsServiceMock.getRevisions).toHaveBeenCalledWith(validBomId);
    });

    it('returns 400 when BOM id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/boms/not-a-uuid/revisions')
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 16. GET /api/v1/boms/:id/revisions/:revisionId (Revision Detail)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/boms/:id/revisions/:revisionId', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';
    const validRevId = '123e4567-e89b-12d3-a456-426614174001';

    it('returns 200 with revision detail', async () => {
      currentUser = { id: 'sa-id', roleCode: 'SA' };

      const res = await request(app.getHttpServer())
        .get(`/api/v1/boms/${validBomId}/revisions/${validRevId}`)
        .expect(200);

      expect(res.body.id).toBe(validRevId);
      expect(bomsServiceMock.getRevisionDetail).toHaveBeenCalledWith(
        validBomId,
        validRevId,
        'SA',
      );
    });

    it('returns 400 when revisionId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/boms/${validBomId}/revisions/not-a-uuid`)
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 17. GET /api/v1/boms/:id/revisions/:revisionId/history (Revision History)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/boms/:id/revisions/:revisionId/history', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';
    const validRevId = '123e4567-e89b-12d3-a456-426614174001';

    it('returns 200 with revision workflow history', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/boms/${validBomId}/revisions/${validRevId}/history`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(bomsServiceMock.getRevisionHistory).toHaveBeenCalledWith(
        validBomId,
        validRevId,
      );
    });

    it('returns 400 when revisionId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/boms/${validBomId}/revisions/not-a-uuid/history`)
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 18. GET /api/v1/boms/:id/revisions/:revisionId/diff (Revision Diff)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/boms/:id/revisions/:revisionId/diff', () => {
    const validBomId = '123e4567-e89b-12d3-a456-426614174000';
    const validRevId = '123e4567-e89b-12d3-a456-426614174001';

    it('returns 200 with revision diff analysis', async () => {
      currentUser = { id: 'sa-id', roleCode: 'SA' };

      const res = await request(app.getHttpServer())
        .get(`/api/v1/boms/${validBomId}/revisions/${validRevId}/diff`)
        .expect(200);

      expect(res.body.targetRevisionId).toBe(validRevId);
      expect(bomsServiceMock.getRevisionDiff).toHaveBeenCalledWith(
        validBomId,
        validRevId,
        undefined,
        'SA',
      );
    });

    it('returns 400 when revisionId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/boms/${validBomId}/revisions/not-a-uuid/diff`)
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 19. POST /api/v1/boms/:id/copy-from-fit (Copy Fit BOM -> PO BOM)
  // ──────────────────────────────────────────────────────────────────────────
  describe('POST /api/v1/boms/:id/copy-from-fit', () => {
    const validTargetBomId = '123e4567-e89b-12d3-a456-426614174000';
    const validSourceRevId = '123e4567-e89b-12d3-a456-426614174001';

    it('returns 200 when copying from Fit BOM with valid sourceRevisionId', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${validTargetBomId}/copy-from-fit`)
        .send({ sourceRevisionId: validSourceRevId })
        .expect(200);

      expect(res.body.id).toBe(validTargetBomId);
      expect(res.body.costPerUnit).toBeNull();
      expect(bomsServiceMock.copyFromFit).toHaveBeenCalledWith(
        validTargetBomId,
        expect.objectContaining({ sourceRevisionId: validSourceRevId }),
        'nvkh-id',
        'NVKH',
      );
    });

    it('returns 200 when copying from Fit BOM with empty body (auto-resolve source revision)', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/boms/${validTargetBomId}/copy-from-fit`)
        .send({})
        .expect(200);

      expect(res.body.id).toBe(validTargetBomId);
      expect(bomsServiceMock.copyFromFit).toHaveBeenCalledWith(
        validTargetBomId,
        {},
        'nvkh-id',
        'NVKH',
      );
    });

    it('returns 400 when sourceRevisionId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validTargetBomId}/copy-from-fit`)
        .send({ sourceRevisionId: 'invalid-uuid' })
        .expect(400);
    });

    it('returns 400 when client injects forbidden fields (e.g. unitCost, sourceBomId)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validTargetBomId}/copy-from-fit`)
        .send({
          sourceRevisionId: validSourceRevId,
          unitCost: 100,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/v1/boms/${validTargetBomId}/copy-from-fit`)
        .send({
          sourceRevisionId: validSourceRevId,
          sourceBomId: validTargetBomId,
        })
        .expect(400);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 20. GET /api/v1/boms/aggregate (NPL Aggregate)
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/boms/aggregate', () => {
    it('returns 200 with NPL aggregate items and cost when role is TPKH', async () => {
      currentUser = { id: 'tpkh-id', roleCode: 'TPKH' };

      const res = await request(app.getHttpServer())
        .get('/api/v1/boms/aggregate')
        .query({ page: 1, limit: 10, breakdown: 'color' })
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].totalRequiredQuantity).toBe(2500);
      expect(res.body.data[0].totalEstimatedCost).toBe(300000000);
      expect(res.body.data[0].unitCost).toBe(120000);
      expect(res.body.data[0].breakdown).toBeDefined();
      expect(bomAggregateServiceMock.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 10, breakdown: 'color' }),
        'TPKH',
      );
    });

    it('masks cost fields to null when role is NVKH', async () => {
      currentUser = { id: 'nvkh-id', roleCode: 'NVKH' };

      const res = await request(app.getHttpServer())
        .get('/api/v1/boms/aggregate')
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].totalRequiredQuantity).toBe(2500);
      expect(res.body.data[0].totalEstimatedCost).toBeNull();
      expect(res.body.data[0].unitCost).toBeNull();
    });

    it('returns 400 when limit exceeds 100 or page is less than 1', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/boms/aggregate')
        .query({ limit: 200 })
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/v1/boms/aggregate')
        .query({ page: 0 })
        .expect(400);
    });

    it('returns 400 when breakdown type is invalid', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/boms/aggregate')
        .query({ breakdown: 'invalid_breakdown' })
        .expect(400);
    });
  });
});
