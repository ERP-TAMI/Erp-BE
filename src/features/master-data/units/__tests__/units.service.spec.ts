import { Repository } from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Unit } from '../../entities/Unit.entity';
import { UnitsService } from '../units.service';

describe('UnitsService', () => {
  let units: jest.Mocked<Repository<Unit>>;
  let service: UnitsService;

  beforeEach(() => {
    units = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Unit>>;
    service = new UnitsService(units);
  });

  it('returns active units in stable code order for selectors', async () => {
    units.find.mockResolvedValue([
      {
        id: '41fc8e1b-0441-463b-af3f-edf74592084d',
        code: 'M',
        name: 'Mét',
        decimalScale: 4,
        status: RecordStatus.ACTIVE,
      },
    ]);

    await expect(
      service.findAll({ status: RecordStatus.ACTIVE }),
    ).resolves.toEqual([
      {
        id: '41fc8e1b-0441-463b-af3f-edf74592084d',
        code: 'M',
        name: 'Mét',
        decimalScale: 4,
        status: RecordStatus.ACTIVE,
      },
    ]);
    expect(units.find).toHaveBeenCalledWith({
      where: { status: RecordStatus.ACTIVE },
      order: { code: 'ASC', id: 'ASC' },
    });
  });
});
