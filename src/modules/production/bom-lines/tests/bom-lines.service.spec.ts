import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { BomLinesRepository } from '../repositories/bom-lines.repository';
import { BomLinesService } from '../services/bom-lines.service';

describe('BomLinesService', () => {
  const bomId = 'dc3a787f-aa4a-43ee-86c9-67871fdf6224';
  const materialId = 'c5ab824e-8e6d-42b0-8d9d-a02d34762d40';
  const activeMaterial = {
    id: materialId,
    materialName: 'Cotton',
    lastUnitCost: '12.50',
    status: RecordStatus.ACTIVE,
    materialGroup: { name: 'Fabric' },
    defaultUnit: { name: 'Metre' },
  };
  const savedLine = {
    id: 'bbf24018-1dca-40bc-bfcb-3d438b90a43e',
    billOfMaterialId: bomId,
    materialId,
    materialNameSnapshot: 'Cotton',
    materialGroupSnapshot: 'Fabric',
    unitSnapshot: 'Metre',
    consumptionPerUnit: '1.250000',
    unitCost: '12.50',
    orderIndex: 0,
  };
  let repository: jest.Mocked<BomLinesRepository>;
  let service: BomLinesService;

  beforeEach(() => {
    repository = {
      bomExists: jest.fn(),
      findMaterial: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<BomLinesRepository>;
    service = new BomLinesService(repository);
  });

  it('creates a line from an active material and stores server snapshots', async () => {
    repository.bomExists.mockResolvedValue(true);
    repository.findMaterial.mockResolvedValue(activeMaterial as never);
    repository.create.mockImplementation((value) => value as never);
    repository.save.mockResolvedValue(savedLine as never);

    await expect(
      service.create(bomId, {
        materialId,
        consumptionPerUnit: 1.25,
        orderIndex: 0,
      }),
    ).resolves.toMatchObject({
      materialNameSnapshot: 'Cotton',
      materialGroupSnapshot: 'Fabric',
      unitSnapshot: 'Metre',
      consumptionPerUnit: 1.25,
      unitCost: 12.5,
    });
    expect(repository.create).toHaveBeenCalledWith({
      billOfMaterialId: bomId,
      materialId,
      materialNameSnapshot: 'Cotton',
      materialGroupSnapshot: 'Fabric',
      unitSnapshot: 'Metre',
      consumptionPerUnit: 1.25,
      unitCost: 12.5,
      orderIndex: 0,
    });
  });

  it('rejects a missing BOM', async () => {
    repository.bomExists.mockResolvedValue(false);

    await expect(
      service.create(bomId, {
        materialId,
        consumptionPerUnit: 1,
        orderIndex: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a missing material', async () => {
    repository.bomExists.mockResolvedValue(true);
    repository.findMaterial.mockResolvedValue(null);

    await expect(
      service.create(bomId, {
        materialId,
        consumptionPerUnit: 1,
        orderIndex: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an inactive material even when called directly', async () => {
    repository.bomExists.mockResolvedValue(true);
    repository.findMaterial.mockResolvedValue({
      ...activeMaterial,
      status: RecordStatus.INACTIVE,
    } as never);

    await expect(
      service.create(bomId, {
        materialId,
        consumptionPerUnit: 1,
        orderIndex: 0,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns stored snapshots without looking up the current material', async () => {
    repository.bomExists.mockResolvedValue(true);
    repository.list.mockResolvedValue([savedLine] as never);

    await expect(service.list(bomId)).resolves.toEqual([
      expect.objectContaining({
        materialNameSnapshot: 'Cotton',
        materialGroupSnapshot: 'Fabric',
      }),
    ]);
    expect(repository.findMaterial).not.toHaveBeenCalled();
  });
});
