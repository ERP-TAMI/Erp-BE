import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Workshop } from '../../entities/Workshop.entity';
import { WorkshopsService } from '../workshops.service';

describe('WorkshopsService', () => {
  const workshop: Workshop = {
    id: 'f4ab3c98-2941-42e9-a92a-1e90f6087fd0',
    workshopCode: 'X-01',
    name: 'Xưởng May 1',
    manager: 'Nguyễn Văn A',
    location: 'Khu A',
    dailyCapacity: 500,
    status: RecordStatus.ACTIVE,
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    updatedAt: new Date('2026-08-26T00:00:00.000Z'),
  };

  let workshops: jest.Mocked<Repository<Workshop>>;
  let normalizedCodeResult: jest.Mock<Promise<Workshop | null>, []>;
  let service: WorkshopsService;

  beforeEach(() => {
    normalizedCodeResult = jest.fn();
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: normalizedCodeResult,
    } as unknown as SelectQueryBuilder<Workshop>;

    workshops = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Workshop>>;
    service = new WorkshopsService(workshops);
  });

  it('creates an active workshop and maps capacity to dailyCapacity', async () => {
    normalizedCodeResult.mockResolvedValue(null);
    workshops.create.mockReturnValue({ ...workshop });
    workshops.save.mockResolvedValue({ ...workshop });

    await expect(
      service.create({
        workshopCode: 'X-01',
        name: 'Xưởng May 1',
        manager: 'Nguyễn Văn A',
        location: 'Khu A',
        capacity: 500,
      }),
    ).resolves.toMatchObject({
      workshopCode: 'X-01',
      capacity: 500,
      status: RecordStatus.ACTIVE,
    });

    expect(workshops.create).toHaveBeenCalledWith({
      workshopCode: 'X-01',
      name: 'Xưởng May 1',
      manager: 'Nguyễn Văn A',
      location: 'Khu A',
      dailyCapacity: 500,
      status: RecordStatus.ACTIVE,
    });
  });

  it('normalizes blank optional text and defaults capacity to zero', async () => {
    normalizedCodeResult.mockResolvedValue(null);
    workshops.create.mockImplementation(
      (value) => ({ ...workshop, ...value }) as Workshop,
    );
    workshops.save.mockImplementation(async (value) => value as Workshop);

    await service.create({
      workshopCode: 'X-02',
      name: 'Xưởng May 2',
      manager: '   ',
      location: null,
    });

    expect(workshops.create).toHaveBeenCalledWith(
      expect.objectContaining({
        manager: null,
        location: null,
        dailyCapacity: 0,
      }),
    );
  });

  it('rejects duplicate workshop codes after case and whitespace normalization', async () => {
    normalizedCodeResult.mockResolvedValue(workshop);

    await expect(
      service.create({ workshopCode: ' x-01 ', name: 'Xưởng khác' }),
    ).rejects.toThrow(ConflictException);
    expect(workshops.save).not.toHaveBeenCalled();
  });

  it('maps a concurrent unique violation to conflict', async () => {
    normalizedCodeResult.mockResolvedValue(null);
    workshops.create.mockReturnValue({ ...workshop });
    workshops.save.mockRejectedValue({ code: '23505' });

    await expect(
      service.create({ workshopCode: 'X-01', name: 'Xưởng May 1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('searches code, name and manager while filtering active workshops', async () => {
    workshops.find.mockResolvedValue([workshop]);

    await expect(
      service.findAll({ search: 'may', status: RecordStatus.ACTIVE }),
    ).resolves.toEqual([
      expect.objectContaining({ workshopCode: 'X-01', capacity: 500 }),
    ]);

    expect(workshops.find).toHaveBeenCalledWith({
      where: [
        { status: RecordStatus.ACTIVE, workshopCode: expect.anything() },
        { status: RecordStatus.ACTIVE, name: expect.anything() },
        { status: RecordStatus.ACTIVE, manager: expect.anything() },
      ],
      order: { workshopCode: 'ASC', id: 'ASC' },
    });
  });

  it('returns only active workshops for the production-plan selector contract', async () => {
    workshops.find.mockResolvedValue([workshop]);

    await service.findAll({ status: RecordStatus.ACTIVE });

    expect(workshops.find).toHaveBeenCalledWith({
      where: { status: RecordStatus.ACTIVE },
      order: { workshopCode: 'ASC', id: 'ASC' },
    });
  });

  it('updates mutable fields without accepting a workshop code', async () => {
    workshops.findOneBy.mockResolvedValue({ ...workshop });
    workshops.save.mockImplementation(async (value) => value as Workshop);

    await expect(
      service.update(workshop.id, {
        name: 'Xưởng May Chính',
        manager: '',
        location: 'Khu B',
        capacity: 700,
      }),
    ).resolves.toMatchObject({
      workshopCode: 'X-01',
      name: 'Xưởng May Chính',
      manager: null,
      location: 'Khu B',
      capacity: 700,
    });
  });

  it('changes status without deleting the workshop', async () => {
    workshops.findOneBy.mockResolvedValue({ ...workshop });
    workshops.save.mockImplementation(async (value) => value as Workshop);

    await expect(
      service.updateStatus(workshop.id, { status: RecordStatus.INACTIVE }),
    ).resolves.toMatchObject({ status: RecordStatus.INACTIVE });
  });

  it('returns not found when the requested workshop does not exist', async () => {
    workshops.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(workshop.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
