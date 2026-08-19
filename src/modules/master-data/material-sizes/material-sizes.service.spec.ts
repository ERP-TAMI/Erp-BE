import { ConflictException } from '@nestjs/common';
import { RecordStatus } from '../../../common/enums/database.enums';
import { MaterialSizesService } from './material-sizes.service';

describe('MaterialSizesService', () => {
  const materialId = 'c5ab824e-8e6d-42b0-8d9d-a02d34762d40';
  const material = { id: materialId };
  const sizes = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const materials = { findOneBy: jest.fn() };
  const service = new MaterialSizesService(materials as never, sizes as never);

  beforeEach(() => jest.clearAllMocks());

  it('normalizes size code and applies defaults', async () => {
    materials.findOneBy.mockResolvedValue(material);
    sizes.findOneBy.mockResolvedValue(null);
    sizes.create.mockImplementation((value) => value);
    sizes.save.mockImplementation(async (value) => value);
    await expect(
      service.create(materialId, { sizeCode: ' m ' } as never),
    ).resolves.toMatchObject({
      sizeCode: 'M',
      currentStock: 0,
      lowStockThreshold: 10,
      status: RecordStatus.ACTIVE,
    });
  });

  it('rejects a duplicate size within one material', async () => {
    materials.findOneBy.mockResolvedValue(material);
    sizes.findOneBy.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create(materialId, { sizeCode: 'M' } as never),
    ).rejects.toThrow(ConflictException);
  });
});
