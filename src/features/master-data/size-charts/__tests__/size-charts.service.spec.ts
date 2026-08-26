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
import { SizeChart } from '../../entities/SizeChart.entity';
import { SizeChartItem } from '../../entities/SizeChartItem.entity';
import { SizeChartsService } from '../size-charts.service';

describe('SizeChartsService', () => {
  const chart: SizeChart = {
    id: '0cf40521-6666-4cc1-b6f7-f91346350255',
    name: 'Size áo nam',
    status: RecordStatus.ACTIVE,
    revisionNo: 1,
    supersedesId: null as unknown as string,
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    updatedAt: new Date('2026-08-26T00:00:00.000Z'),
  };
  const chartItems: SizeChartItem[] = [
    {
      id: 'bf317b72-0f9e-4404-a537-4280332c8bf1',
      sizeChartId: chart.id,
      sizeLabel: 'XS',
      orderIndex: 0,
    },
    {
      id: 'aaf5df25-12c0-4f3e-b885-f2c8a7b32c6b',
      sizeChartId: chart.id,
      sizeLabel: 'M',
      orderIndex: 1,
    },
  ];

  let charts: jest.Mocked<Repository<SizeChart>>;
  let items: jest.Mocked<Repository<SizeChartItem>>;
  let normalizedNameResult: jest.Mock<Promise<SizeChart | null>, []>;
  let dataSource: jest.Mocked<DataSource>;
  let service: SizeChartsService;

  beforeEach(() => {
    normalizedNameResult = jest.fn().mockResolvedValue(null);
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: normalizedNameResult,
    } as unknown as SelectQueryBuilder<SizeChart>;

    charts = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<SizeChart>>;
    items = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<SizeChartItem>>;

    const manager = {
      getRepository: jest.fn((entity) =>
        entity === SizeChart ? charts : items,
      ),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    } as unknown as jest.Mocked<DataSource>;
    service = new SizeChartsService(charts, items, dataSource);

    charts.findOneBy.mockResolvedValue({ ...chart });
    items.find.mockResolvedValue(chartItems.map((item) => ({ ...item })));
  });

  it('lists charts with ordered sizes without querying items per chart', async () => {
    charts.find.mockResolvedValue([{ ...chart }]);

    await expect(
      service.findAll({ search: ' áo ', status: RecordStatus.ACTIVE }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: chart.id,
        name: 'Size áo nam',
        sizes: ['XS', 'M'],
        status: RecordStatus.ACTIVE,
      }),
    ]);

    expect(charts.find).toHaveBeenCalledWith({
      where: { name: expect.anything(), status: RecordStatus.ACTIVE },
      order: { name: 'ASC', id: 'ASC' },
    });
    expect(items.find).toHaveBeenCalledTimes(1);
  });

  it('creates an active chart and normalizes ordered size labels atomically', async () => {
    const savedWithoutTimestamps = {
      ...chart,
      createdAt: undefined,
      updatedAt: undefined,
    } as unknown as SizeChart;
    charts.create.mockReturnValue(savedWithoutTimestamps);
    charts.save.mockResolvedValue(savedWithoutTimestamps);
    items.create.mockImplementation((value) => value as SizeChartItem);
    (items.save as jest.Mock).mockImplementation(async (value) => value);

    await expect(
      service.create({
        name: '  Size   áo nam  ',
        sizes: [' XS ', '  Áo   trẻ em ', 'M'],
      }),
    ).resolves.toMatchObject({
      id: chart.id,
      sizes: ['XS', 'M'],
      createdAt: chart.createdAt,
      updatedAt: chart.updatedAt,
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(charts.create).toHaveBeenCalledWith({
      name: 'Size áo nam',
      status: RecordStatus.ACTIVE,
    });
    expect(items.create).toHaveBeenNthCalledWith(1, {
      sizeChartId: chart.id,
      sizeLabel: 'XS',
      orderIndex: 0,
    });
    expect(items.create).toHaveBeenNthCalledWith(2, {
      sizeChartId: chart.id,
      sizeLabel: 'Áo trẻ em',
      orderIndex: 1,
    });
    expect(items.create).toHaveBeenNthCalledWith(3, {
      sizeChartId: chart.id,
      sizeLabel: 'M',
      orderIndex: 2,
    });
    expect(charts.findOneBy).toHaveBeenCalledWith({ id: chart.id });
  });

  it('rejects duplicate sizes after whitespace and case normalization', async () => {
    await expect(
      service.create({ name: 'Size áo nam', sizes: ['M', ' m  '] }),
    ).rejects.toThrow(BadRequestException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(charts.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate normalized chart name', async () => {
    normalizedNameResult.mockResolvedValue({ ...chart });

    await expect(
      service.create({ name: ' size áo nam ', sizes: ['S'] }),
    ).rejects.toThrow(ConflictException);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('replaces the complete ordered size list during an in-place update', async () => {
    charts.save.mockImplementation(async (value) => value as SizeChart);
    items.create.mockImplementation((value) => value as SizeChartItem);
    (items.save as jest.Mock).mockImplementation(async (value) => value);
    items.find
      .mockResolvedValueOnce([
        {
          id: chartItems[0].id,
          sizeChartId: chart.id,
          sizeLabel: 'S',
          orderIndex: 0,
        },
        {
          id: chartItems[1].id,
          sizeChartId: chart.id,
          sizeLabel: 'L',
          orderIndex: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: chartItems[0].id,
          sizeChartId: chart.id,
          sizeLabel: 'S',
          orderIndex: 0,
        },
        {
          id: chartItems[1].id,
          sizeChartId: chart.id,
          sizeLabel: 'L',
          orderIndex: 1,
        },
      ]);

    await expect(
      service.update(chart.id, {
        name: ' Size áo nam chuẩn ',
        sizes: [' S ', 'L'],
      }),
    ).resolves.toMatchObject({
      id: chart.id,
      name: 'Size áo nam chuẩn',
      sizes: ['S', 'L'],
    });

    expect(items.delete).toHaveBeenCalledWith({ sizeChartId: chart.id });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('changes status and returns the complete chart response', async () => {
    charts.save.mockImplementation(async (value) => value as SizeChart);
    charts.findOneBy
      .mockResolvedValueOnce({ ...chart })
      .mockResolvedValueOnce({ ...chart, status: RecordStatus.INACTIVE });

    await expect(
      service.updateStatus(chart.id, { status: RecordStatus.INACTIVE }),
    ).resolves.toMatchObject({
      status: RecordStatus.INACTIVE,
      sizes: ['XS', 'M'],
    });
  });

  it('maps a concurrent unique-name violation to conflict', async () => {
    charts.create.mockReturnValue({ ...chart });
    charts.save.mockRejectedValue({
      code: '23505',
      constraint: 'uq_size_charts_name_normalized',
    });

    await expect(
      service.create({ name: 'Size áo nam', sizes: ['S'] }),
    ).rejects.toThrow(ConflictException);
  });

  it('does not misreport another unique constraint as a duplicate name', async () => {
    const itemConstraintError = {
      code: '23505',
      constraint: 'uq_size_chart_order',
    };
    charts.create.mockReturnValue({ ...chart });
    charts.save.mockRejectedValue(itemConstraintError);

    await expect(
      service.create({ name: 'Size áo nam', sizes: ['S'] }),
    ).rejects.toBe(itemConstraintError);
  });

  it('returns not found for an unknown chart', async () => {
    charts.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(chart.id)).rejects.toThrow(NotFoundException);
  });
});
