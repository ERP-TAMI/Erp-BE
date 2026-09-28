import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Unit } from '../../entities/Unit.entity';
import { UnitsService } from '../units.service';

describe('UnitsService', () => {
  let units: jest.Mocked<Repository<Unit>>;
  let queryBuilder: {
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };
  let service: UnitsService;

  beforeEach(() => {
    queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };
    units = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(queryBuilder as unknown as SelectQueryBuilder<Unit>),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Unit>>;
    service = new UnitsService(units);
  });

  it('returns active units in stable name order for selectors', async () => {
    queryBuilder.getManyAndCount.mockResolvedValue([
      [
        {
          id: '41fc8e1b-0441-463b-af3f-edf74592084d',
          name: 'Mét',
          status: RecordStatus.ACTIVE,
        },
      ],
      1,
    ]);

    await expect(
      service.findAll({ status: RecordStatus.ACTIVE }),
    ).resolves.toEqual({
      data: [
        {
          id: '41fc8e1b-0441-463b-af3f-edf74592084d',
          name: 'Mét',
          status: RecordStatus.ACTIVE,
        },
      ],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'unit.status = :status',
      { status: RecordStatus.ACTIVE },
    );
  });

  it('creates an active unit', async () => {
    const created = {
      id: '41fc8e1b-0441-463b-af3f-edf74592084d',
      name: 'Cuộn',
      status: RecordStatus.ACTIVE,
    };
    units.create.mockReturnValue(created);
    units.save.mockResolvedValue(created);

    await expect(service.create({ name: 'Cuộn' })).resolves.toEqual(created);
    expect(units.create).toHaveBeenCalledWith({
      name: 'Cuộn',
      status: RecordStatus.ACTIVE,
    });
  });

  it('renames a unit', async () => {
    const existing = {
      id: '41fc8e1b-0441-463b-af3f-edf74592084d',
      name: 'Cuon',
      status: RecordStatus.ACTIVE,
    };
    units.findOneBy.mockResolvedValue(existing);
    units.save.mockResolvedValue({
      ...existing,
      name: 'Cuộn',
    });

    await expect(
      service.update(existing.id, { name: 'Cuộn' }),
    ).resolves.toMatchObject({ name: 'Cuộn' });
    expect(units.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cuộn' }),
    );
  });

  it('returns not found when updating an unknown unit', async () => {
    units.findOneBy.mockResolvedValue(null);

    await expect(
      service.update('missing-id', { name: 'Cuộn' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('deactivates a unit so it stops showing up for material selectors', async () => {
    const existing = {
      id: '41fc8e1b-0441-463b-af3f-edf74592084d',
      name: 'Cuộn (nhầm)',
      status: RecordStatus.ACTIVE,
    };
    units.findOneBy.mockResolvedValue(existing);
    units.save.mockResolvedValue({
      ...existing,
      status: RecordStatus.INACTIVE,
    });

    await expect(
      service.updateStatus(existing.id, { status: RecordStatus.INACTIVE }),
    ).resolves.toMatchObject({ status: RecordStatus.INACTIVE });
    expect(units.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: RecordStatus.INACTIVE }),
    );
  });

  it('returns not found when deactivating an unknown unit', async () => {
    units.findOneBy.mockResolvedValue(null);

    await expect(
      service.updateStatus('missing-id', { status: RecordStatus.INACTIVE }),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes an unreferenced unit', async () => {
    const existing = {
      id: '41fc8e1b-0441-463b-af3f-edf74592084d',
      name: 'Cuộn (nhầm)',
      status: RecordStatus.ACTIVE,
    };
    units.findOneBy.mockResolvedValue(existing);
    units.remove.mockResolvedValue(existing);

    await expect(service.remove(existing.id)).resolves.toBeUndefined();
    expect(units.remove).toHaveBeenCalledWith(existing);
  });

  it('returns a conflict when the unit is referenced by business data', async () => {
    const existing = {
      id: '41fc8e1b-0441-463b-af3f-edf74592084d',
      name: 'Mét',
      status: RecordStatus.ACTIVE,
    };
    units.findOneBy.mockResolvedValue(existing);
    units.remove.mockRejectedValue({ code: '23503' });

    await expect(service.remove(existing.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('returns not found when deleting an unknown unit', async () => {
    units.findOneBy.mockResolvedValue(null);

    await expect(service.remove('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
