import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { MaterialSizeReferenceMap } from '../repositories/material-size-reference-map';
import { MaterialSizesRepository } from '../repositories/material-sizes.repository';
import { MaterialSizesService } from '../services/material-sizes.service';

describe('MaterialSizesService', () => {
  const materialId = 'c5ab824e-8e6d-42b0-8d9d-a02d34762d40';
  const sizeId = '33b27a8c-d43d-46f6-a3c4-e40ae72ef3e8';
  const material = { id: materialId };
  const existingSize = {
    id: sizeId,
    materialId,
    sizeCode: 'M',
    barcode: null,
    unitCost: '1.50',
    currentStock: '2.0000',
    lowStockThreshold: '10.0000',
    status: RecordStatus.ACTIVE,
  };
  const repository = {
    materialExists: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByCode: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const referenceMap = { hasReference: jest.fn() };
  const service = new MaterialSizesService(
    repository as unknown as MaterialSizesRepository,
    referenceMap as unknown as MaterialSizeReferenceMap,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    referenceMap.hasReference.mockResolvedValue(false);
  });

  it('normalizes size code, applies defaults, and returns numeric values', async () => {
    repository.materialExists.mockResolvedValue(Boolean(material));
    repository.findByCode.mockResolvedValue(null);
    repository.create.mockImplementation((value) => value);
    repository.save.mockImplementation(async (value) => ({
      id: sizeId,
      ...value,
      unitCost: '0.00',
      currentStock: '0.0000',
      lowStockThreshold: '10.0000',
    }));

    await expect(
      service.create(materialId, { sizeCode: ' m ' }),
    ).resolves.toMatchObject({
      sizeCode: 'M',
      unitCost: 0,
      currentStock: 0,
      lowStockThreshold: 10,
      status: RecordStatus.ACTIVE,
    });
  });

  it('rejects a duplicate size within one material', async () => {
    repository.materialExists.mockResolvedValue(Boolean(material));
    repository.findByCode.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(materialId, { sizeCode: ' m ' }),
    ).rejects.toThrow(ConflictException);
    expect(repository.findByCode).toHaveBeenCalledWith(materialId, 'M');
  });

  it('returns not found when the parent material does not exist', async () => {
    repository.materialExists.mockResolvedValue(false);

    await expect(service.create(materialId, { sizeCode: 'M' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('normalizes size code when updating without restoring the raw value', async () => {
    repository.findById.mockResolvedValueOnce({ ...existingSize });
    repository.findByCode.mockResolvedValueOnce(null);
    repository.save.mockImplementation(async (value) => value);

    await expect(
      service.update(materialId, sizeId, {
        sizeCode: ' xl ',
        barcode: ' 12345 ',
      }),
    ).resolves.toMatchObject({ sizeCode: 'XL', barcode: '12345' });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ sizeCode: 'XL', barcode: '12345' }),
    );
  });

  it('clears an existing barcode when update receives an empty value', async () => {
    repository.findById.mockResolvedValue({
      ...existingSize,
      barcode: '12345',
    });
    repository.save.mockImplementation(async (value) => value);

    await expect(
      service.update(materialId, sizeId, { barcode: '' }),
    ).resolves.toMatchObject({ barcode: null });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: null }),
    );
  });

  it('updates status for a size belonging to the material', async () => {
    repository.findById.mockResolvedValue({ ...existingSize });
    repository.save.mockImplementation(async (value) => value);

    await expect(
      service.updateStatus(materialId, sizeId, RecordStatus.INACTIVE),
    ).resolves.toMatchObject({ status: RecordStatus.INACTIVE });
  });

  it('blocks deletion when the reference map reports a consumer', async () => {
    repository.findById.mockResolvedValue({ ...existingSize });
    referenceMap.hasReference.mockResolvedValue(true);

    await expect(service.remove(materialId, sizeId)).rejects.toThrow(
      ConflictException,
    );
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced size', async () => {
    repository.findById.mockResolvedValue({ ...existingSize });

    await expect(service.remove(materialId, sizeId)).resolves.toBeUndefined();
    expect(repository.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: sizeId }),
    );
  });
});
