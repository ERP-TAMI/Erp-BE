import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { StageGroup } from '../../entities/StageGroup.entity';
import { StageGroupItem } from '../../entities/StageGroupItem.entity';
import { StageGroupsService } from '../stage-groups.service';

describe('StageGroupsService', () => {
  const groupId = '64bfc097-69d1-43f5-af97-cb0e7428f7df';
  const itemId = '771c0dc2-cd59-44e3-9b16-cacb200f20e5';
  const secondItemId = '4f71709a-aa73-44a9-9217-79a464287567';
  const group: StageGroup = {
    id: groupId,
    groupCode: 'NC-MAY',
    groupName: 'Nhóm may',
    description: null,
    status: RecordStatus.ACTIVE,
    createdAt: new Date('2026-08-24T01:00:00.000Z'),
    updatedAt: new Date('2026-08-24T01:00:00.000Z'),
  };
  const item: StageGroupItem = {
    id: itemId,
    stageGroupId: groupId,
    itemName: 'May thân',
    description: 'May ráp thân',
    ssv: '12.500',
    status: RecordStatus.ACTIVE,
    orderIndex: 0,
  };

  let groups: jest.Mocked<Repository<StageGroup>>;
  let items: jest.Mocked<Repository<StageGroupItem>>;
  let dataSource: jest.Mocked<DataSource>;
  let groupQueryBuilder: SelectQueryBuilder<StageGroup>;
  let itemQueryBuilder: SelectQueryBuilder<StageGroupItem>;
  let service: StageGroupsService;

  beforeEach(() => {
    groupQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    } as unknown as SelectQueryBuilder<StageGroup>;
    itemQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    } as unknown as SelectQueryBuilder<StageGroupItem>;

    groups = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((value) => ({ ...group, ...value }) as StageGroup),
      save: jest.fn(async (value) => value as StageGroup),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(groupQueryBuilder),
    } as unknown as jest.Mocked<Repository<StageGroup>>;
    items = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value as StageGroupItem),
      save: jest.fn(async (value) => {
        const rows = value as StageGroupItem[];
        return rows.map((row, index) => ({
          ...row,
          id: row.id ?? (index === 0 ? itemId : secondItemId),
        }));
      }),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(itemQueryBuilder),
    } as unknown as jest.Mocked<Repository<StageGroupItem>>;

    const manager = {
      getRepository: jest.fn((entity) =>
        entity === StageGroup ? groups : items,
      ),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    } as unknown as jest.Mocked<DataSource>;
    service = new StageGroupsService(groups, items, dataSource);
  });

  it('lists groups using database-side child counts', async () => {
    groups.find.mockResolvedValue([group]);
    (itemQueryBuilder.getRawMany as jest.Mock).mockResolvedValue([
      { stageGroupId: groupId, itemCount: '2' },
    ]);

    await expect(service.findAll({})).resolves.toEqual([
      expect.objectContaining({ id: groupId, itemCount: 2 }),
    ]);
    expect(itemQueryBuilder.addSelect).toHaveBeenCalledWith(
      'COUNT(item.id)',
      'itemCount',
    );
    expect(items.find).not.toHaveBeenCalled();
  });

  it('creates owned child operations without consulting Stage Master', async () => {
    const response = await service.create({
      groupCode: ' nc-may ',
      groupName: ' Nhóm may ',
      description: ' ',
      items: [
        {
          itemName: ' May thân ',
          description: ' May ráp thân ',
          ssv: '12.500',
          orderIndex: 0,
        },
      ],
    });

    expect(response).toEqual(
      expect.objectContaining({
        groupCode: 'NC-MAY',
        items: [
          expect.objectContaining({
            id: itemId,
            itemName: 'May thân',
            description: 'May ráp thân',
            ssv: '12.500',
            status: RecordStatus.ACTIVE,
          }),
        ],
      }),
    );
    expect(items.create).toHaveBeenCalledWith({
      stageGroupId: groupId,
      itemName: 'May thân',
      description: 'May ráp thân',
      ssv: '12.500',
      status: RecordStatus.ACTIVE,
      orderIndex: 0,
    });
  });

  it('rejects non-contiguous child order at the service boundary', async () => {
    await expect(
      service.create({
        groupName: 'Nhóm may',
        items: [{ itemName: 'May thân', ssv: '1.000', orderIndex: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(groups.save).not.toHaveBeenCalled();
  });

  it('keeps retained IDs, inserts new children, and removes omitted children', async () => {
    const removed: StageGroupItem = {
      ...item,
      id: secondItemId,
      itemName: 'Cắt vải',
      orderIndex: 1,
    };
    groups.findOneBy.mockResolvedValue({ ...group });
    items.find.mockResolvedValue([item, removed]);

    const response = await service.update(groupId, {
      items: [
        {
          id: itemId,
          itemName: 'May thân mới',
          description: null,
          ssv: '15.000',
          status: RecordStatus.INACTIVE,
          orderIndex: 0,
        },
        {
          itemName: 'Ủi thân',
          description: null,
          ssv: '8.000',
          status: RecordStatus.ACTIVE,
          orderIndex: 1,
        },
      ],
    });

    expect(response.items[0]).toEqual(
      expect.objectContaining({ id: itemId, itemName: 'May thân mới' }),
    );
    expect(items.delete).toHaveBeenCalledWith({
      id: expect.objectContaining({ _value: [secondItemId] }),
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an item ID that belongs to another group', async () => {
    groups.findOneBy.mockResolvedValue({ ...group });
    items.find.mockResolvedValue([item]);

    await expect(
      service.update(groupId, {
        items: [
          {
            id: secondItemId,
            itemName: 'Cắt vải',
            ssv: '8.000',
            orderIndex: 0,
          },
        ],
      }),
    ).rejects.toThrow('do not belong to this group');
  });

  it('rejects duplicate retained child IDs', async () => {
    groups.findOneBy.mockResolvedValue({ ...group });

    await expect(
      service.update(groupId, {
        items: [
          { id: itemId, itemName: 'May 1', ssv: '1.000', orderIndex: 0 },
          { id: itemId, itemName: 'May 2', ssv: '2.000', orderIndex: 1 },
        ],
      }),
    ).rejects.toThrow('duplicate IDs');
    expect(items.find).not.toHaveBeenCalled();
  });

  it('loads independent children in order', async () => {
    groups.findOneBy.mockResolvedValue(group);
    items.find.mockResolvedValue([item]);

    await expect(service.findOne(groupId)).resolves.toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ id: itemId, itemName: 'May thân' })],
      }),
    );
    expect(items.find).toHaveBeenCalledWith({
      where: { stageGroupId: groupId },
      order: { orderIndex: 'ASC', id: 'ASC' },
    });
  });

  it('returns not found for an unknown group', async () => {
    groups.findOneBy.mockResolvedValue(null);
    await expect(service.findOne(groupId)).rejects.toThrow(NotFoundException);
  });

  it('rejects deletion when business data references the stage group', async () => {
    groups.findOneBy.mockResolvedValue(group);
    groups.remove.mockRejectedValue({ code: '23503' });
    await expect(service.remove(groupId)).rejects.toThrow(ConflictException);
  });
});
