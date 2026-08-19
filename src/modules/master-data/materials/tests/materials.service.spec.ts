import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Material } from '../../../../features/master-data/entities/Material.entity';
import { MaterialGroup } from '../../../../features/master-data/entities/MaterialGroup.entity';
import { Unit } from '../../../../features/master-data/entities/Unit.entity';
import { MaterialsRepository } from '../repositories/materials.repository';
import { MaterialsService } from '../services/materials.service';

describe('MaterialsService', () => {
  const activeGroup: MaterialGroup = {
    id: 'c6df31f6-7df0-43d1-a5e7-03fa5087bf90',
    code: 'FABRIC',
    name: 'Fabric',
    displayOrder: 0,
    status: RecordStatus.ACTIVE,
  };
  const inactiveGroup: MaterialGroup = {
    ...activeGroup,
    id: '8723b05a-7f4e-49ba-ae1c-9500c4ac9c13',
    status: RecordStatus.INACTIVE,
  };
  const material: Material = {
    id: 'c5ab824e-8e6d-42b0-8d9d-a02d34762d40',
    materialCode: 'COTTON',
    materialName: 'Cotton',
    materialGroupId: activeGroup.id,
    defaultUnitId: undefined as unknown as string,
    defaultYieldPct: 0,
    lastUnitCost: 0,
    currentStock: 0,
    lowStockThreshold: 10,
    status: RecordStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const activeUnit: Unit = {
    id: '75f6349c-6866-478c-866a-33c0148df9b6',
    code: 'M',
    name: 'Metre',
    decimalScale: 2,
    status: RecordStatus.ACTIVE,
  };

  let repository: jest.Mocked<MaterialsRepository>;
  let service: MaterialsService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findGroupById: jest.fn(),
      findUnitById: jest.fn(),
      hasReference: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<MaterialsRepository>;
    service = new MaterialsService(repository);
  });

  it('creates a material only with an active material group', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.findGroupById.mockResolvedValue(activeGroup);
    repository.findUnitById.mockResolvedValue(activeUnit);
    repository.create.mockImplementation((input) => ({
      ...material,
      ...input,
    }));
    repository.save.mockImplementation(async (value) => value);

    await expect(
      service.create({
        materialCode: ' cotton ',
        materialName: ' Cotton ',
        materialGroupId: activeGroup.id,
        defaultUnitId: activeUnit.id,
        defaultYieldPct: 2.5,
        lastUnitCost: 35000,
        currentStock: 12.5,
        lowStockThreshold: 3,
      }),
    ).resolves.toMatchObject({
      materialCode: 'COTTON',
      materialGroupId: activeGroup.id,
      defaultUnitId: activeUnit.id,
      materialGroup: null,
      defaultUnit: null,
    });
  });

  it('rejects creating a material with an inactive material group', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.findGroupById.mockResolvedValue(inactiveGroup);
    repository.findUnitById.mockResolvedValue(activeUnit);

    await expect(
      service.create({
        materialCode: 'COTTON',
        materialName: 'Cotton',
        materialGroupId: inactiveGroup.id,
        defaultUnitId: activeUnit.id,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects creating a material with an inactive unit', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.findGroupById.mockResolvedValue(activeGroup);
    repository.findUnitById.mockResolvedValue({
      ...activeUnit,
      status: RecordStatus.INACTIVE,
    });

    await expect(
      service.create({
        materialCode: 'COTTON',
        materialName: 'Cotton',
        materialGroupId: activeGroup.id,
        defaultUnitId: activeUnit.id,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('keeps an inactive historical group when the group id is unchanged', async () => {
    const historicalMaterial = {
      ...material,
      materialGroupId: inactiveGroup.id,
    };
    repository.findById.mockResolvedValue(historicalMaterial);
    repository.save.mockResolvedValue(historicalMaterial);

    await expect(
      service.update(material.id, {
        materialName: 'Updated cotton',
        materialGroupId: inactiveGroup.id,
      }),
    ).resolves.toMatchObject({ materialGroupId: inactiveGroup.id });
  });

  it('rejects changing a material to an inactive material group', async () => {
    repository.findById.mockResolvedValue(material);
    repository.findGroupById.mockResolvedValue(inactiveGroup);

    await expect(
      service.update(material.id, { materialGroupId: inactiveGroup.id }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns not found when the material is absent', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.findOne(material.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('forwards list filters to the repository', async () => {
    repository.findAll.mockResolvedValue([material]);

    await expect(
      service.findAll({
        search: 'cotton',
        materialGroupId: activeGroup.id,
        status: RecordStatus.ACTIVE,
      }),
    ).resolves.toHaveLength(1);
    expect(repository.findAll).toHaveBeenCalledWith({
      search: 'cotton',
      materialGroupId: activeGroup.id,
      status: RecordStatus.ACTIVE,
    });
  });

  it('does not hard-delete a material that is referenced by business data', async () => {
    repository.findById.mockResolvedValue(material);
    repository.hasReference.mockResolvedValue(true);

    await expect(service.remove(material.id)).rejects.toThrow(
      ConflictException,
    );
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
