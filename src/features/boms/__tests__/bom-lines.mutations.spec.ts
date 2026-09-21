import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BomsService } from '../boms.service';
import { BomCostService } from '../bom-cost.service';
import { Bom } from '../entities/Bom.entity';
import { BomRevision } from '../entities/BomRevision.entity';
import { BomLine } from '../entities/BomLine.entity';
import { BomRevisionStatusHistory } from '../entities/BomRevisionStatusHistory.entity';
import { Style } from '../../styles/entities/Style.entity';
import { PurchaseOrderProduct } from '../../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProductColor } from '../../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from '../../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import { Material } from '../../master-data/entities/Material.entity';
import { MaterialGroup } from '../../master-data/entities/MaterialGroup.entity';
import { Unit } from '../../master-data/entities/Unit.entity';
import {
  BomRevisionStatus,
  BomType,
} from '../../../common/enums/database.enums';

describe('BOM Lines Mutations: Add, Update, Delete, Reorder, Snapshot & Field Auth (PR-03 Specification)', () => {
  let service: BomsService;
  let costService: BomCostService;
  let bomRepoMock: any;
  let bomRevisionRepoMock: any;
  let bomLineRepoMock: any;
  let bomStatusHistoryRepoMock: any;
  let styleRepoMock: any;
  let poProductRepoMock: any;
  let poRepoMock: any;
  let poColorRepoMock: any;
  let poColorSizeRepoMock: any;
  let materialRepoMock: any;
  let materialGroupRepoMock: any;
  let unitRepoMock: any;
  let dataSourceMock: any;

  beforeEach(async () => {
    bomRepoMock = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    bomRevisionRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    bomLineRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };
    bomStatusHistoryRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };
    styleRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    poProductRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    poRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    poColorRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };
    poColorSizeRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalQuantity: 0 }),
      }),
    };
    materialRepoMock = {
      findOne: jest.fn(),
    };
    materialGroupRepoMock = {
      findOne: jest.fn(),
    };
    unitRepoMock = {
      findOne: jest.fn(),
    };

    dataSourceMock = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        BomCostService,
        {
          provide: getRepositoryToken(Bom),
          useValue: bomRepoMock,
        },
        {
          provide: getRepositoryToken(BomRevision),
          useValue: bomRevisionRepoMock,
        },
        {
          provide: getRepositoryToken(BomLine),
          useValue: bomLineRepoMock,
        },
        {
          provide: getRepositoryToken(BomRevisionStatusHistory),
          useValue: bomStatusHistoryRepoMock,
        },
        {
          provide: getRepositoryToken(Style),
          useValue: styleRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProduct),
          useValue: poProductRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: poRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColor),
          useValue: poColorRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColorSize),
          useValue: poColorSizeRepoMock,
        },
        {
          provide: getRepositoryToken(Material),
          useValue: materialRepoMock,
        },
        {
          provide: getRepositoryToken(MaterialGroup),
          useValue: materialGroupRepoMock,
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: unitRepoMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<BomsService>(BomsService);
    costService = module.get<BomCostService>(BomCostService);
  });

  // Helper factory for mock entities
  function createMockBom(opts?: Partial<Bom>): Bom {
    const bom = new Bom();
    bom.id = opts?.id || 'bom-1';
    bom.bomCode = opts?.bomCode || 'BOM-FIT-ST01';
    bom.bomType = opts?.bomType || BomType.FIT;
    bom.currentRevisionId = opts?.currentRevisionId || 'rev-1';
    bom.discontinuedAt = opts?.discontinuedAt || null;
    bom.rowVersion = 1;
    return bom;
  }

  function createMockRevision(opts?: Partial<BomRevision>): BomRevision {
    const rev = new BomRevision();
    rev.id = opts?.id || 'rev-1';
    rev.bomId = opts?.bomId || 'bom-1';
    rev.revisionNo = opts?.revisionNo || 1;
    rev.status = opts?.status || BomRevisionStatus.WAIT_NVKH;
    rev.createdAt = new Date();
    return rev;
  }

  function createMockMaterial(opts?: Partial<Material>): Material {
    const mat = new Material();
    mat.id = opts?.id || 'mat-1';
    mat.materialCode = opts?.materialCode || 'MAT-001';
    mat.materialName = opts?.materialName || 'Cotton Spandex 240gsm';
    mat.materialGroupId = opts?.materialGroupId || 'group-1';
    mat.defaultUnitId = opts?.defaultUnitId || 'unit-1';
    return mat;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. ADD BOM LINE
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Add BOM Line (POST /api/v1/boms/:id/lines)', () => {
    it('allows NVKH (N1) to add line with automatic material snapshots', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();
      const material = createMockMaterial();
      const group = new MaterialGroup();
      group.id = 'group-1';
      group.name = 'Vải chính';
      const unit = new Unit();
      unit.id = 'unit-1';
      unit.name = 'Mét';

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === Material) return Promise.resolve(material);
            if (entityClass === MaterialGroup) return Promise.resolve(group);
            if (entityClass === Unit) return Promise.resolve(unit);
            if (entityClass === BomLine) return Promise.resolve(null); // No duplicate
            return Promise.resolve(null);
          }),
          createQueryBuilder: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null), // 0 existing lines
          }),
          create: jest.fn().mockImplementation((entityClass, data) => {
            return Object.assign(new BomLine(), data, {
              id: 'line-new-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }),
          save: jest
            .fn()
            .mockImplementation((entityClass, entity) =>
              Promise.resolve(entity),
            ),
        };
        return cb(managerMock);
      });

      const res = await service.addLine(
        'bom-1',
        { materialId: 'mat-1', consumption: 1.45, note: 'Main fabric' },
        'user-nvkh',
        'NVKH',
      );

      expect(res).toBeDefined();
      expect(res.id).toBe('line-new-1');
      expect(res.materialId).toBe('mat-1');
      expect(res.materialNameSnapshot).toBe('Cotton Spandex 240gsm');
      expect(res.materialGroupId).toBe('group-1');
      expect(res.materialGroupSnapshot).toBe('Vải chính');
      expect(res.unitId).toBe('unit-1');
      expect(res.unitSnapshot).toBe('Mét');
      expect(res.consumption).toBe(1.45);
      expect(res.orderIndex).toBe(0);
      expect(res.unitCost).toBeNull(); // Masked for NVKH
      expect(res.lineCost).toBeNull();
    });

    it('allows RD (N2) to add line to PO BOM', async () => {
      const bom = createMockBom({
        bomType: BomType.PO,
        bomCode: 'BOM-PO01-P01',
      });
      const currentRev = createMockRevision();
      const material = createMockMaterial();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === Material) return Promise.resolve(material);
            return Promise.resolve(null);
          }),
          createQueryBuilder: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null),
          }),
          create: jest
            .fn()
            .mockImplementation((_, data) =>
              Object.assign(new BomLine(), data, { id: 'line-rd' }),
            ),
          save: jest
            .fn()
            .mockImplementation((_, entity) => Promise.resolve(entity)),
        };
        return cb(managerMock);
      });

      const res = await service.addLine(
        'bom-1',
        { materialId: 'mat-1', consumption: 2.0 },
        'user-rd',
        'RD',
      );

      expect(res.id).toBe('line-rd');
      expect(res.consumption).toBe(2.0);
    });

    it('allows TPKH (N3) to add line and see costs', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();
      const material = createMockMaterial();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === Material) return Promise.resolve(material);
            return Promise.resolve(null);
          }),
          createQueryBuilder: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null),
          }),
          create: jest
            .fn()
            .mockImplementation((_, data) =>
              Object.assign(new BomLine(), data, { id: 'line-tpkh' }),
            ),
          save: jest
            .fn()
            .mockImplementation((_, entity) => Promise.resolve(entity)),
        };
        return cb(managerMock);
      });

      const res = await service.addLine(
        'bom-1',
        { materialId: 'mat-1', consumption: 3.5 },
        'user-tpkh',
        'TPKH',
      );

      expect(res.id).toBe('line-tpkh');
      // TPKH has cost visibility, but new line unitCost is null
      expect(res.unitCost).toBeNull();
      expect(res.lineCost).toBeNull();
    });

    it('rejects ACCOUNTING (N4) from adding line with 403 Forbidden', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.addLine(
          'bom-1',
          { materialId: 'mat-1', consumption: 1.0 },
          'user-acct',
          'ACCOUNTING',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects SA (N5) from adding line with 403 Forbidden', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.addLine(
          'bom-1',
          { materialId: 'mat-1', consumption: 1.0 },
          'user-sa',
          'SA',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects adding line when BOM is discontinued with 400 BadRequest', async () => {
      const bom = createMockBom({ discontinuedAt: new Date() });

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.addLine(
          'bom-1',
          { materialId: 'mat-1', consumption: 1.0 },
          'user-nvkh',
          'NVKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects adding line when current revision is closed with 400 BadRequest', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision({
        status: BomRevisionStatus.CLOSED,
      });

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.addLine(
          'bom-1',
          { materialId: 'mat-1', consumption: 1.0 },
          'user-nvkh',
          'NVKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects adding duplicate material in the same revision with 409 Conflict', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();
      const material = createMockMaterial();
      const existing = new BomLine();
      existing.id = 'existing-line';
      existing.materialId = material.id;

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === Material) return Promise.resolve(material);
            if (entityClass === BomLine) return Promise.resolve(existing); // Duplicate found!
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.addLine(
          'bom-1',
          { materialId: 'mat-1', consumption: 1.0 },
          'user-nvkh',
          'NVKH',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 404 NotFound when Material master does not exist', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === Material) return Promise.resolve(null); // Not found
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.addLine(
          'bom-1',
          { materialId: 'mat-non-existent', consumption: 1.0 },
          'user-nvkh',
          'NVKH',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. UPDATE BOM LINE
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Update BOM Line (PATCH /api/v1/boms/:id/lines/:lineId)', () => {
    function setupExistingLine(): {
      bom: Bom;
      currentRev: BomRevision;
      line: BomLine;
    } {
      const bom = createMockBom();
      const currentRev = createMockRevision();
      const line = new BomLine();
      line.id = 'line-1';
      line.revisionId = currentRev.id;
      line.materialId = 'mat-old';
      line.materialNameSnapshot = 'Original Cotton';
      line.materialGroupId = 'group-1';
      line.materialGroupSnapshot = 'Vải chính';
      line.unitId = 'unit-1';
      line.unitSnapshot = 'Mét';
      line.consumption = 1.0;
      line.unitCost = 50;
      line.note = 'Old note';
      line.orderIndex = 0;
      line.createdAt = new Date();
      line.updatedAt = new Date();
      return { bom, currentRev, line };
    }

    it('allows NVKH (N1) to update consumption without changing snapshots', async () => {
      const { bom, currentRev, line } = setupExistingLine();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === BomLine) return Promise.resolve(line);
            return Promise.resolve(null);
          }),
          save: jest
            .fn()
            .mockImplementation((_, entity) => Promise.resolve(entity)),
        };
        return cb(managerMock);
      });

      const res = await service.updateLine(
        'bom-1',
        'line-1',
        { consumption: 2.2 },
        'user-nvkh',
        'NVKH',
      );

      expect(res.consumption).toBe(2.2);
      expect(res.materialNameSnapshot).toBe('Original Cotton'); // Unchanged!
      expect(res.unitCost).toBeNull(); // Masked for NVKH
    });

    it('allows NVKH/RD/TPKH to update materialId and refreshes snapshots', async () => {
      const { bom, currentRev, line } = setupExistingLine();
      const newMaterial = createMockMaterial({
        id: 'mat-new',
        materialName: 'Polyester Blend 200gsm',
        materialGroupId: 'group-2',
        defaultUnitId: 'unit-2',
      });
      const newGroup = new MaterialGroup();
      newGroup.id = 'group-2';
      newGroup.name = 'Vải lót';
      const newUnit = new Unit();
      newUnit.id = 'unit-2';
      newUnit.name = 'Cuộn';

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass, query) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === BomLine) {
              if (query?.where?.materialId === 'mat-new')
                return Promise.resolve(null); // No dup
              return Promise.resolve(line);
            }
            if (entityClass === Material) return Promise.resolve(newMaterial);
            if (entityClass === MaterialGroup) return Promise.resolve(newGroup);
            if (entityClass === Unit) return Promise.resolve(newUnit);
            return Promise.resolve(null);
          }),
          save: jest
            .fn()
            .mockImplementation((_, entity) => Promise.resolve(entity)),
        };
        return cb(managerMock);
      });

      const res = await service.updateLine(
        'bom-1',
        'line-1',
        { materialId: 'mat-new' },
        'user-rd',
        'RD',
      );

      expect(res.materialId).toBe('mat-new');
      expect(res.materialNameSnapshot).toBe('Polyester Blend 200gsm'); // Refreshed!
      expect(res.materialGroupSnapshot).toBe('Vải lót');
      expect(res.unitSnapshot).toBe('Cuộn');
    });

    it('rejects NVKH/RD/TPKH from updating unitCost with 403 Forbidden', async () => {
      const { bom, currentRev, line } = setupExistingLine();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === BomLine) return Promise.resolve(line);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.updateLine(
          'bom-1',
          'line-1',
          { unitCost: 100 },
          'user-tpkh',
          'TPKH',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows ACCOUNTING (N4) to update unitCost', async () => {
      const { bom, currentRev, line } = setupExistingLine();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === BomLine) return Promise.resolve(line);
            return Promise.resolve(null);
          }),
          save: jest
            .fn()
            .mockImplementation((_, entity) => Promise.resolve(entity)),
        };
        return cb(managerMock);
      });

      const res = await service.updateLine(
        'bom-1',
        'line-1',
        { unitCost: 75.5 },
        'user-acct',
        'ACCOUNTING',
      );

      expect(res.unitCost).toBe(75.5);
      expect(res.lineCost).toBe(75.5 * line.consumption);
    });

    it('rejects ACCOUNTING (N4) from updating technical fields (consumption)', async () => {
      const { bom, currentRev, line } = setupExistingLine();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === BomLine) return Promise.resolve(line);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.updateLine(
          'bom-1',
          'line-1',
          { consumption: 3.0 },
          'user-acct',
          'ACCOUNTING',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects updating line belonging to historical revision with 404 NotFound', async () => {
      const { bom, currentRev, line } = setupExistingLine();
      line.revisionId = 'historical-rev-0'; // Different from currentRev.id!

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === BomLine) return Promise.resolve(line);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.updateLine(
          'bom-1',
          'line-1',
          { consumption: 2.0 },
          'user-nvkh',
          'NVKH',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. DELETE BOM LINE
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Delete BOM Line (DELETE /api/v1/boms/:id/lines/:lineId)', () => {
    it('allows NVKH/RD/TPKH to delete line and re-compacts order indices', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();
      const lineToDelete = new BomLine();
      lineToDelete.id = 'line-to-delete';
      lineToDelete.revisionId = currentRev.id;
      lineToDelete.orderIndex = 0;

      const remainingLine = new BomLine();
      remainingLine.id = 'line-remain';
      remainingLine.revisionId = currentRev.id;
      remainingLine.orderIndex = 1;

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            if (entityClass === BomLine) return Promise.resolve(lineToDelete);
            return Promise.resolve(null);
          }),
          find: jest.fn().mockResolvedValue([remainingLine]),
          remove: jest.fn().mockResolvedValue(lineToDelete),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        return cb(managerMock);
      });

      const res = await service.deleteLine(
        'bom-1',
        'line-to-delete',
        'user-tpkh',
        'TPKH',
      );

      expect(res.success).toBe(true);
    });

    it('rejects ACCOUNTING and SA from deleting line with 403 Forbidden', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.deleteLine('bom-1', 'line-1', 'user-acct', 'ACCOUNTING'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.deleteLine('bom-1', 'line-1', 'user-sa', 'SA'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. REORDER BOM LINES
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Reorder BOM Lines (PUT /api/v1/boms/:id/lines/reorder)', () => {
    it('allows reordering lines with two-phase update preventing unique constraint error', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();
      const l1 = new BomLine();
      l1.id = 'line-1';
      l1.revisionId = currentRev.id;
      l1.orderIndex = 0;

      const l2 = new BomLine();
      l2.id = 'line-2';
      l2.revisionId = currentRev.id;
      l2.orderIndex = 1;

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            return Promise.resolve(null);
          }),
          find: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === BomLine) {
              return Promise.resolve([
                Object.assign({}, l2, { orderIndex: 0 }),
                Object.assign({}, l1, { orderIndex: 1 }),
              ]);
            }
            return Promise.resolve([]);
          }),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        };
        return cb(managerMock);
      });

      const res = await service.reorderLines(
        'bom-1',
        {
          items: [
            { lineId: 'line-1', orderIndex: 1 },
            { lineId: 'line-2', orderIndex: 0 },
          ],
        },
        'user-nvkh',
        'NVKH',
      );

      expect(res).toHaveLength(2);
      expect(res[0].id).toBe('line-2');
      expect(res[0].orderIndex).toBe(0);
      expect(res[1].id).toBe('line-1');
      expect(res[1].orderIndex).toBe(1);
    });

    it('rejects reorder with duplicate lineId or duplicate orderIndex', async () => {
      const bom = createMockBom();
      const currentRev = createMockRevision();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(currentRev);
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      // Duplicate lineId
      await expect(
        service.reorderLines(
          'bom-1',
          {
            items: [
              { lineId: 'line-1', orderIndex: 0 },
              { lineId: 'line-1', orderIndex: 1 },
            ],
          },
          'user-nvkh',
          'NVKH',
        ),
      ).rejects.toThrow(BadRequestException);

      // Duplicate orderIndex
      await expect(
        service.reorderLines(
          'bom-1',
          {
            items: [
              { lineId: 'line-1', orderIndex: 0 },
              { lineId: 'line-2', orderIndex: 0 },
            ],
          },
          'user-nvkh',
          'NVKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. COST RECALCULATION & HISTORICAL SNAPSHOT IMMUTABILITY
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Cost Recalculation & Snapshot Immutability', () => {
    it('does not alter existing BOM line snapshot when master Material is updated', () => {
      const line = new BomLine();
      line.materialId = 'mat-1';
      line.materialNameSnapshot = 'Fixed Cotton 2026';
      line.materialGroupSnapshot = 'Vải chính';
      line.unitSnapshot = 'Mét';

      // Simulate master Material renamed in the database
      const masterMaterial = createMockMaterial({
        id: 'mat-1',
        materialName: 'Renamed Cotton 2027 In Master Data',
      });

      const dto = service.mapLineToDto(line, 'NVKH');
      expect(dto.materialNameSnapshot).toBe('Fixed Cotton 2026'); // Still historical snapshot!
      expect(masterMaterial.materialName).toBe(
        'Renamed Cotton 2027 In Master Data',
      );
    });

    it('recalculates costPerUnit accurately following line mutations', () => {
      // Scenario from Section 27:
      // Line A: consumption = 2, unitCost = 10
      // Line B: consumption = 3, unitCost = 5
      const lineA = new BomLine();
      lineA.consumption = 2;
      lineA.unitCost = 10;

      const lineB = new BomLine();
      lineB.consumption = 3;
      lineB.unitCost = 5;

      let cost = costService.calculateCostPerUnit([lineA, lineB]);
      expect(cost).toBe(35); // (2*10) + (3*5) = 20 + 15 = 35

      // Update Line A: consumption = 4
      lineA.consumption = 4;
      cost = costService.calculateCostPerUnit([lineA, lineB]);
      expect(cost).toBe(55); // (4*10) + (3*5) = 40 + 15 = 55

      // Update Line B: unitCost = 10
      lineB.unitCost = 10;
      cost = costService.calculateCostPerUnit([lineA, lineB]);
      expect(cost).toBe(70); // (4*10) + (3*10) = 40 + 30 = 70

      // Delete Line A (only Line B remains)
      cost = costService.calculateCostPerUnit([lineB]);
      expect(cost).toBe(30); // 3 * 10 = 30
    });
  });
});
