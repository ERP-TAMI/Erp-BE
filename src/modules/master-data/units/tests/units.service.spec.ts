import { RecordStatus } from '../../../../common/enums/database.enums';
import { UnitsRepository } from '../repositories/units.repository';
import { UnitsService } from '../services/units.service';

describe('UnitsService', () => {
  const unitsRepository = {
    findAll: jest.fn(),
  };
  let service: UnitsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UnitsService(unitsRepository as unknown as UnitsRepository);
  });

  it('returns active units for material form options', async () => {
    unitsRepository.findAll.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000002',
        code: 'M',
        name: 'Mét',
        decimalScale: 3,
        status: RecordStatus.ACTIVE,
      },
    ]);

    await expect(
      service.findAll({ status: RecordStatus.ACTIVE }),
    ).resolves.toEqual([
      {
        id: '00000000-0000-4000-8000-000000000002',
        code: 'M',
        name: 'Mét',
        status: RecordStatus.ACTIVE,
      },
    ]);
    expect(unitsRepository.findAll).toHaveBeenCalledWith(RecordStatus.ACTIVE);
  });
});
