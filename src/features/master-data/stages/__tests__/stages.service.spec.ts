import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Stage } from '../../entities/Stage.entity';
import { StagesService } from '../stages.service';

describe('StagesService', () => {
  const stage: Stage = {
    id: '64bfc097-69d1-43f5-af97-cb0e7428f7df',
    stageCode: 'GD-CAT',
    stageName: 'Cắt vải',
    description: 'Cắt chi tiết theo sơ đồ',
    defaultSsv: '12.500',
    status: RecordStatus.ACTIVE,
  };

  let stages: jest.Mocked<Repository<Stage>>;
  let normalizedCodeResult: jest.Mock<Promise<Stage | null>, []>;
  let service: StagesService;

  beforeEach(() => {
    normalizedCodeResult = jest.fn().mockResolvedValue(null);
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: normalizedCodeResult,
    } as unknown as SelectQueryBuilder<Stage>;

    stages = {
      find: jest.fn(),
      findBy: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Stage>>;
    service = new StagesService(stages);
  });

  it('creates an active stage with normalized text and zero SSV by default', async () => {
    const created = {
      ...stage,
      stageCode: 'GD-MAY',
      stageName: 'May thân trước',
      description: null,
      defaultSsv: '0',
    };
    stages.create.mockReturnValue(created);
    stages.save.mockResolvedValue(created);

    await expect(
      service.create({
        stageCode: ' gd-may ',
        stageName: ' May thân trước ',
        description: '   ',
      }),
    ).resolves.toEqual({
      id: created.id,
      stageCode: 'GD-MAY',
      stageName: 'May thân trước',
      description: null,
      ssv: '0',
      status: RecordStatus.ACTIVE,
    });

    expect(stages.create).toHaveBeenCalledWith({
      stageCode: 'GD-MAY',
      stageName: 'May thân trước',
      description: null,
      defaultSsv: '0',
      status: RecordStatus.ACTIVE,
    });
  });

  it('rejects duplicate codes after trim and uppercase normalization', async () => {
    normalizedCodeResult.mockResolvedValue(stage);

    await expect(
      service.create({ stageCode: ' gd-cat ', stageName: 'Trùng mã' }),
    ).rejects.toThrow(ConflictException);
    expect(stages.save).not.toHaveBeenCalled();
  });

  it('generates a normalized code from the stage name when code is omitted', async () => {
    const created = {
      ...stage,
      stageCode: 'GD-UI-TP-PHA-HOI',
      stageName: 'Ủi TP + phà hơi',
    };
    stages.create.mockReturnValue(created);
    stages.save.mockResolvedValue(created);

    await expect(
      service.create({ stageName: ' Ủi TP + phà hơi ' }),
    ).resolves.toMatchObject({
      stageCode: 'GD-UI-TP-PHA-HOI',
      stageName: 'Ủi TP + phà hơi',
    });

    expect(stages.create).toHaveBeenCalledWith(
      expect.objectContaining({ stageCode: 'GD-UI-TP-PHA-HOI' }),
    );
  });

  it('adds a numeric suffix when an automatically generated code exists', async () => {
    const created = {
      ...stage,
      stageCode: 'GD-CAT-VAI-2',
      stageName: 'Cắt vải',
    };
    normalizedCodeResult
      .mockResolvedValueOnce(stage)
      .mockResolvedValueOnce(null);
    stages.create.mockReturnValue(created);
    stages.save.mockResolvedValue(created);

    await expect(
      service.create({ stageName: 'Cắt vải' }),
    ).resolves.toMatchObject({ stageCode: 'GD-CAT-VAI-2' });
  });

  it('retries with the next suffix when a concurrent create claims the generated code', async () => {
    const generatedStage = {
      ...stage,
      stageCode: 'GD-CAT-VAI-2',
      stageName: 'Cắt vải',
    };
    normalizedCodeResult
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stage)
      .mockResolvedValueOnce(null);
    stages.create.mockImplementation(
      (input) => ({ ...stage, ...input }) as Stage,
    );
    stages.save
      .mockRejectedValueOnce({ code: '23505' })
      .mockResolvedValueOnce(generatedStage);

    await expect(
      service.create({ stageName: 'Cắt vải' }),
    ).resolves.toMatchObject({ stageCode: 'GD-CAT-VAI-2' });
    expect(stages.save).toHaveBeenCalledTimes(2);
  });

  it('lists stages using server-side search and status filters', async () => {
    stages.find.mockResolvedValue([stage]);

    await expect(
      service.findAll({ search: ' cắt ', status: RecordStatus.ACTIVE }),
    ).resolves.toEqual([
      {
        id: stage.id,
        stageCode: 'GD-CAT',
        stageName: 'Cắt vải',
        description: stage.description,
        ssv: '12.500',
        status: RecordStatus.ACTIVE,
      },
    ]);

    expect(stages.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { stageCode: 'ASC', id: 'ASC' } }),
    );
  });

  it('updates mutable stage fields without changing the stage code', async () => {
    stages.findOneBy.mockResolvedValue({ ...stage });
    stages.save.mockImplementation(async (value) => value as Stage);

    await expect(
      service.update(stage.id, {
        stageName: ' Cắt laser ',
        description: '',
        ssv: '15.250',
      }),
    ).resolves.toMatchObject({
      stageCode: 'GD-CAT',
      stageName: 'Cắt laser',
      description: null,
      ssv: '15.250',
    });
  });

  it('changes status through the dedicated operation', async () => {
    stages.findOneBy.mockResolvedValue({ ...stage });
    stages.save.mockImplementation(async (value) => value as Stage);

    await expect(
      service.updateStatus(stage.id, { status: RecordStatus.INACTIVE }),
    ).resolves.toMatchObject({ status: RecordStatus.INACTIVE });
  });

  it('updates SSV for every requested stage in one save operation', async () => {
    const secondStage = {
      ...stage,
      id: '771c0dc2-cd59-44e3-9b16-cacb200f20e5',
      stageCode: 'GD-MAY',
    };
    stages.findBy.mockResolvedValue([{ ...stage }, secondStage]);
    (stages.save as jest.Mock).mockImplementation(
      async (value) => value as Stage[],
    );

    await expect(
      service.updateSsvBulk({
        items: [
          { id: stage.id, ssv: '13.000' },
          { id: secondStage.id, ssv: '8.250' },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: stage.id, ssv: '13.000' }),
      expect.objectContaining({ id: secondStage.id, ssv: '8.250' }),
    ]);
    expect(stages.save).toHaveBeenCalledTimes(1);
  });

  it('does not save a partial bulk update when any stage is missing', async () => {
    stages.findBy.mockResolvedValue([{ ...stage }]);

    await expect(
      service.updateSsvBulk({
        items: [
          { id: stage.id, ssv: '13.000' },
          { id: '771c0dc2-cd59-44e3-9b16-cacb200f20e5', ssv: '8.250' },
        ],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(stages.save).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown stage', async () => {
    stages.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(stage.id)).rejects.toThrow(NotFoundException);
  });
});
