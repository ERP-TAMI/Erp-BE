import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Material } from '../../../../features/master-data/entities/Material.entity';
import { MaterialGroup } from '../../../../features/master-data/entities/MaterialGroup.entity';
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
    status: RecordStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let repository: jest.Mocked<MaterialsRepository>;
  let service: MaterialsService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findGroupById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<MaterialsRepository>;
    service = new MaterialsService(repository);
  });

  it('creates a material only with an active material group', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.findGroupById.mockResolvedValue(activeGroup);
    repository.create.mockReturnValue({ ...material });
    repository.save.mockResolvedValue({ ...material });

    await expect(
      service.create({
        materialCode: ' cotton ',
        materialName: ' Cotton ',
        materialGroupId: activeGroup.id,
      }),
    ).resolves.toMatchObject({
      materialCode: 'COTTON',
      materialGroupId: activeGroup.id,
    });
  });

  it('rejects creating a material with an inactive material group', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.findGroupById.mockResolvedValue(inactiveGroup);

    await expect(
      service.create({
        materialCode: 'COTTON',
        materialName: 'Cotton',
        materialGroupId: inactiveGroup.id,
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
});
