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
import { Stage } from '../../entities/Stage.entity';
import { StageGroup } from '../../entities/StageGroup.entity';
import { StageGroupItem } from '../../entities/StageGroupItem.entity';
import { StageGroupsService } from '../stage-groups.service';

describe('StageGroupsService', () => {
  const groupId = '64bfc097-69d1-43f5-af97-cb0e7428f7df';
  const stageId = '771c0dc2-cd59-44e3-9b16-cacb200f20e5';
  const group: StageGroup = {
    id: groupId,
    groupCode: 'NC-MAY',
    groupName: 'Nhóm may',
    description: null,
    status: RecordStatus.ACTIVE,
    createdAt: new Date('2026-08-24T01:00:00.000Z'),
    updatedAt: new Date('2026-08-24T01:00:00.000Z'),
  };
  const stage: Stage = {
    id: stageId,
    stageCode: 'GD-MAY',
    stageName: 'May thân',
    description: 'May ráp thân',
    defaultSsv: '12.500',
    status: RecordStatus.ACTIVE,
  };
  const secondStage: Stage = {
    ...stage,
    id: '4f71709a-aa73-44a9-9217-79a464287567',
    stageCode: 'GD-CAT',
    stageName: 'Cắt vải',
    description: 'Cắt chi tiết',
    defaultSsv: '8.000',
  };

  let groups: jest.Mocked<Repository<StageGroup>>;
  let items: jest.Mocked<Repository<StageGroupItem>>;
  let stages: jest.Mocked<Repository<Stage>>;
  let dataSource: jest.Mocked<DataSource>;
  let groupQueryBuilder: SelectQueryBuilder<StageGroup>;
  let service: StageGroupsService;

  beforeEach(() => {
    groupQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    } as unknown as SelectQueryBuilder<StageGroup>;

    groups = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(groupQueryBuilder),
    } as unknown as jest.Mocked<Repository<StageGroup>>;
    items = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<StageGroupItem>>;
    stages = {
      findBy: jest.fn(),
    } as unknown as jest.Mocked<Repository<Stage>>;

    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === StageGroup) return groups;
        if (entity === StageGroupItem) return items;
        return stages;
      }),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    } as unknown as jest.Mocked<DataSource>;
    service = new StageGroupsService(groups, items, stages, dataSource);
  });

  it('lists groups with their child stage counts', async () => {
    groups.find.mockResolvedValue([group]);
    items.find.mockResolvedValue([
      {
        stageGroupId: groupId,
        stageId,
        orderIndex: 0,
        nameSnapshot: stage.stageName,
        descriptionSnapshot: stage.description,
        ssvSnapshot: stage.defaultSsv,
      },
    ]);

    await expect(service.findAll({})).resolves.toEqual([
      expect.objectContaining({ id: groupId, itemCount: 1 }),
    ]);
  });

  it('creates an active group and snapshots the selected stages', async () => {
    stages.findBy.mockResolvedValue([stage]);
    groups.create.mockReturnValue({ ...group });
    groups.save.mockResolvedValue({ ...group });
    items.create.mockImplementation((value) => value as StageGroupItem);
    (items.save as jest.Mock).mockImplementation(async (value) => value);

    await expect(
      service.create({
        groupCode: ' nc-may ',
        groupName: ' Nhóm may ',
        description: ' ',
        items: [{ stageId, orderIndex: 0 }],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        groupCode: 'NC-MAY',
        groupName: 'Nhóm may',
        status: RecordStatus.ACTIVE,
        items: [
          expect.objectContaining({
            stageId,
            stageCode: 'GD-MAY',
            stageName: 'May thân',
            ssv: '12.500',
            orderIndex: 0,
          }),
        ],
      }),
    );
    expect(items.create).toHaveBeenCalledWith({
      stageGroupId: groupId,
      stageId,
      orderIndex: 0,
      nameSnapshot: 'May thân',
      descriptionSnapshot: 'May ráp thân',
      ssvSnapshot: '12.500',
    });
  });

  it('returns created items sorted by order index regardless of request order', async () => {
    stages.findBy.mockResolvedValue([stage, secondStage]);
    groups.create.mockReturnValue({ ...group });
    groups.save.mockResolvedValue({ ...group });
    items.create.mockImplementation((value) => value as StageGroupItem);
    (items.save as jest.Mock).mockImplementation(async (value) => value);

    const response = await service.create({
      groupCode: 'NC-MAY',
      groupName: 'Nhóm may',
      items: [
        { stageId, orderIndex: 1 },
        { stageId: secondStage.id, orderIndex: 0 },
      ],
    });

    expect(response.items.map((item) => item.orderIndex)).toEqual([0, 1]);
    expect(response.items.map((item) => item.stageId)).toEqual([
      secondStage.id,
      stageId,
    ]);
  });

  it('generates a normalized group code when create omits it', async () => {
    stages.findBy.mockResolvedValue([stage]);
    groups.create.mockImplementation(
      (value) => ({ ...group, ...value }) as StageGroup,
    );
    groups.save.mockImplementation(async (value) => value as StageGroup);
    items.create.mockImplementation((value) => value as StageGroupItem);
    (items.save as jest.Mock).mockImplementation(async (value) => value);

    await expect(
      service.create({
        groupName: ' Nhóm may chính ',
        items: [{ stageId, orderIndex: 0 }],
      }),
    ).resolves.toEqual(
      expect.objectContaining({ groupCode: 'NS-NHOM-MAY-CHINH' }),
    );
  });

  it('adds a numeric suffix when an automatically generated code exists', async () => {
    (groupQueryBuilder.getOne as jest.Mock)
      .mockResolvedValueOnce(group)
      .mockResolvedValueOnce(null);
    stages.findBy.mockResolvedValue([stage]);
    groups.create.mockImplementation(
      (value) => ({ ...group, ...value }) as StageGroup,
    );
    groups.save.mockImplementation(async (value) => value as StageGroup);
    items.create.mockImplementation((value) => value as StageGroupItem);
    (items.save as jest.Mock).mockImplementation(async (value) => value);

    await expect(
      service.create({
        groupName: 'Nhóm may',
        items: [{ stageId, orderIndex: 0 }],
      }),
    ).resolves.toEqual(expect.objectContaining({ groupCode: 'NS-NHOM-MAY-2' }));
  });

  it('rejects create when a referenced stage does not exist', async () => {
    stages.findBy.mockResolvedValue([]);

    await expect(
      service.create({
        groupCode: 'NC-MAY',
        groupName: 'Nhóm may',
        items: [{ stageId, orderIndex: 0 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(groups.save).not.toHaveBeenCalled();
  });

  it('replaces all items atomically when a group is updated', async () => {
    groups.findOneBy.mockResolvedValue({ ...group });
    groups.save.mockImplementation(async (value) => value as StageGroup);
    stages.findBy.mockResolvedValue([stage]);
    items.create.mockImplementation((value) => value as StageGroupItem);
    (items.save as jest.Mock).mockImplementation(async (value) => value);

    await service.update(groupId, {
      groupName: 'Nhóm may mới',
      items: [{ stageId, orderIndex: 0 }],
    });

    expect(items.delete).toHaveBeenCalledWith({ stageGroupId: groupId });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate normalized group codes', async () => {
    (groupQueryBuilder.getOne as jest.Mock).mockResolvedValue(group);

    await expect(
      service.create({
        groupCode: ' nc-may ',
        groupName: 'Nhóm may',
        items: [{ stageId, orderIndex: 0 }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns not found for an unknown group', async () => {
    groups.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(groupId)).rejects.toThrow(NotFoundException);
  });

  it('deletes an existing stage group', async () => {
    groups.findOneBy.mockResolvedValue(group);
    groups.remove.mockResolvedValue(group);

    await expect(service.remove(groupId)).resolves.toBeUndefined();

    expect(groups.remove).toHaveBeenCalledWith(group);
  });

  it('returns not found when deleting an unknown stage group', async () => {
    groups.findOneBy.mockResolvedValue(null);

    await expect(service.remove(groupId)).rejects.toThrow(NotFoundException);
    expect(groups.remove).not.toHaveBeenCalled();
  });

  it('rejects deletion when business data references the stage group', async () => {
    groups.findOneBy.mockResolvedValue(group);
    groups.remove.mockRejectedValue({ code: '23503' });

    await expect(service.remove(groupId)).rejects.toThrow(ConflictException);
  });
});
