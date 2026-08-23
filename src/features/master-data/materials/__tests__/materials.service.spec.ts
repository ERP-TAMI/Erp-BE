import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { BillOfMaterialLine } from '../../../boms/entities/BillOfMaterialLine.entity';
import { DraftBomLine } from '../../../draft-boms/entities/DraftBomLine.entity';
import { Material } from '../../entities/Material.entity';
import { MaterialGroup } from '../../entities/MaterialGroup.entity';
import { MaterialSize } from '../../entities/MaterialSize.entity';
import { Unit } from '../../entities/Unit.entity';
import { MaterialsService } from '../materials.service';

describe('MaterialsService', () => {
  const materialGroup: MaterialGroup = {
    id: 'c8404d89-315f-49e9-bf81-b05f0f410c4a',
    name: 'Fabric',
    status: RecordStatus.ACTIVE,
  };
  const unit: Unit = {
    id: '0a989bfe-fb34-489c-b5fe-30f74a1dc09d',
    code: 'M',
    name: 'Meter',
    decimalScale: 4,
    status: RecordStatus.ACTIVE,
  };
  const material: Material = {
    id: '42ee8a8f-23ff-4a65-9a7f-2ee535cab17f',
    materialCode: 'FAB-001',
    materialName: 'Main fabric',
    materialGroupId: materialGroup.id,
    defaultUnitId: unit.id,
    defaultYieldPct: 2.5,
    lastUnitCost: 12.75,
    currentStock: 100,
    lowStockThreshold: 10,
    status: RecordStatus.ACTIVE,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    updatedAt: new Date('2026-08-23T00:00:00.000Z'),
  };

  let materials: jest.Mocked<Repository<Material>>;
  let materialGroups: jest.Mocked<Repository<MaterialGroup>>;
  let units: jest.Mocked<Repository<Unit>>;
  let materialSizes: jest.Mocked<Repository<MaterialSize>>;
  let draftBomLines: jest.Mocked<Repository<DraftBomLine>>;
  let billOfMaterialLines: jest.Mocked<Repository<BillOfMaterialLine>>;
  let normalizedCodeResult: jest.Mock<Promise<Material | null>, []>;
  let service: MaterialsService;

  beforeEach(() => {
    normalizedCodeResult = jest.fn().mockResolvedValue(null);
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: normalizedCodeResult,
    } as unknown as SelectQueryBuilder<Material>;

    materials = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Material>>;
    materialGroups = {
      findBy: jest.fn().mockResolvedValue([materialGroup]),
      findOneBy: jest.fn().mockResolvedValue(materialGroup),
    } as unknown as jest.Mocked<Repository<MaterialGroup>>;
    units = {
      findBy: jest.fn().mockResolvedValue([unit]),
      findOneBy: jest.fn().mockResolvedValue(unit),
    } as unknown as jest.Mocked<Repository<Unit>>;
    materialSizes = {
      countBy: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<Repository<MaterialSize>>;
    draftBomLines = {
      countBy: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<Repository<DraftBomLine>>;
    billOfMaterialLines = {
      countBy: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<Repository<BillOfMaterialLine>>;

    service = new MaterialsService(
      materials,
      materialGroups,
      units,
      materialSizes,
      draftBomLines,
      billOfMaterialLines,
    );
  });

  it('creates an active material with normalized code and documented defaults', async () => {
    const createdMaterial = {
      ...material,
      materialCode: 'FAB-NEW',
      materialName: 'New fabric',
      defaultYieldPct: 0,
      lastUnitCost: 0,
      currentStock: 0,
      lowStockThreshold: 10,
    };
    materials.create.mockReturnValue(createdMaterial);
    materials.save.mockResolvedValue(createdMaterial);

    await expect(
      service.create({
        materialCode: ' fab-new ',
        materialName: ' New fabric ',
        materialGroupId: materialGroup.id,
        defaultUnitId: unit.id,
      }),
    ).resolves.toMatchObject({
      materialCode: 'FAB-NEW',
      materialName: 'New fabric',
      materialGroupName: 'Fabric',
      defaultUnitCode: 'M',
      status: RecordStatus.ACTIVE,
      defaultYieldPct: '0',
      lowStockThreshold: '10',
    });

    expect(materials.create).toHaveBeenCalledWith({
      materialCode: 'FAB-NEW',
      materialName: 'New fabric',
      materialGroupId: materialGroup.id,
      defaultUnitId: unit.id,
      defaultYieldPct: '0',
      lastUnitCost: '0',
      currentStock: '0',
      lowStockThreshold: '10',
      status: RecordStatus.ACTIVE,
    });
  });

  it('rejects a duplicate code after trim and uppercase normalization', async () => {
    normalizedCodeResult.mockResolvedValue(material);

    await expect(
      service.create({
        materialCode: ' fab-001 ',
        materialName: 'Duplicate',
        defaultUnitId: unit.id,
      }),
    ).rejects.toThrow(ConflictException);
    expect(materials.save).not.toHaveBeenCalled();
  });

  it('rejects a missing or inactive material group on create', async () => {
    materialGroups.findOneBy.mockResolvedValue({
      ...materialGroup,
      status: RecordStatus.INACTIVE,
    });

    await expect(
      service.create({
        materialCode: 'FAB-002',
        materialName: 'Inactive group material',
        materialGroupId: materialGroup.id,
        defaultUnitId: unit.id,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a missing or inactive default unit on create', async () => {
    units.findOneBy.mockResolvedValue(null);

    await expect(
      service.create({
        materialCode: 'FAB-002',
        materialName: 'Missing unit material',
        defaultUnitId: unit.id,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists material responses with server-side search and filters', async () => {
    materials.find.mockResolvedValue([
      {
        ...material,
        defaultYieldPct: '2.5000' as unknown as number,
        lastUnitCost: '12.75' as unknown as number,
      },
    ]);

    const result = await service.findAll({
      search: ' fabric ',
      materialGroupId: materialGroup.id,
      status: RecordStatus.ACTIVE,
    });

    expect(result).toEqual([
      expect.objectContaining({
        materialCode: 'FAB-001',
        materialGroupName: 'Fabric',
        defaultUnitName: 'Meter',
        defaultYieldPct: '2.5000',
        lastUnitCost: '12.75',
      }),
    ]);
    expect(materials.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { materialCode: 'ASC', id: 'ASC' },
      }),
    );
  });

  it('returns database decimals without converting them to JavaScript numbers', async () => {
    materials.findOneBy.mockResolvedValue({
      ...material,
      lastUnitCost: '9007199254740991.01' as unknown as number,
      currentStock: '99999999999999.9999' as unknown as number,
    });

    await expect(service.findOne(material.id)).resolves.toMatchObject({
      lastUnitCost: '9007199254740991.01',
      currentStock: '99999999999999.9999',
    });
  });

  it('keeps the current inactive group when editing historical material', async () => {
    const inactiveGroup = {
      ...materialGroup,
      status: RecordStatus.INACTIVE,
    };
    materials.findOneBy.mockResolvedValue({ ...material });
    materialGroups.findOneBy.mockResolvedValue(inactiveGroup);
    materials.save.mockResolvedValue({
      ...material,
      materialName: 'Renamed fabric',
    });

    await expect(
      service.update(material.id, {
        materialName: ' Renamed fabric ',
        materialGroupId: materialGroup.id,
      }),
    ).resolves.toMatchObject({
      materialName: 'Renamed fabric',
      materialGroupName: 'Fabric',
    });

    expect(materials.save).toHaveBeenCalled();
  });

  it('rejects switching to a different inactive group', async () => {
    const inactiveGroupId = '64d916a5-c12f-4224-a1fe-b221c6e9b253';
    materials.findOneBy.mockResolvedValue({ ...material });
    materialGroups.findOneBy.mockResolvedValue({
      ...materialGroup,
      id: inactiveGroupId,
      status: RecordStatus.INACTIVE,
    });

    await expect(
      service.update(material.id, { materialGroupId: inactiveGroupId }),
    ).rejects.toThrow(BadRequestException);
    expect(materials.save).not.toHaveBeenCalled();
  });

  it('changes status through the dedicated operation', async () => {
    materials.findOneBy.mockResolvedValue({ ...material });
    materials.save.mockResolvedValue({
      ...material,
      status: RecordStatus.INACTIVE,
    });

    await expect(
      service.updateStatus(material.id, { status: RecordStatus.INACTIVE }),
    ).resolves.toMatchObject({ status: RecordStatus.INACTIVE });
  });

  it('does not hard-delete a material referenced by business data', async () => {
    materials.findOneBy.mockResolvedValue(material);
    draftBomLines.countBy.mockResolvedValue(1);

    await expect(service.remove(material.id)).rejects.toThrow(
      ConflictException,
    );
    expect(materials.remove).not.toHaveBeenCalled();
  });

  it('returns conflict when a concurrent foreign key reference prevents deletion', async () => {
    materials.findOneBy.mockResolvedValue(material);
    materials.remove.mockRejectedValue({ code: '23503' });

    await expect(service.remove(material.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('returns not found for an unknown material', async () => {
    materials.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(material.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
