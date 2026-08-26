import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { SizeChart } from '../src/features/master-data/entities/SizeChart.entity';
import { SizeChartItem } from '../src/features/master-data/entities/SizeChartItem.entity';

describe('Size Charts API with PostgreSQL (e2e)', () => {
  const runKey = `TST-SC-${process.pid}`;
  let app: INestApplication;
  let dataSource: DataSource;
  let charts: Repository<SizeChart>;
  let items: Repository<SizeChartItem>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    charts = dataSource.getRepository(SizeChart);
    items = dataSource.getRepository(SizeChartItem);
    await cleanupTestRows();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await cleanupTestRows();
    if (app) await app.close();
  });

  async function cleanupTestRows(): Promise<void> {
    const testCharts = await charts.find({
      select: { id: true },
      where: { name: Like(`${runKey}%`) },
    });
    if (testCharts.length === 0) return;
    const chartIds = testCharts.map((chart) => chart.id);
    await items.delete({ sizeChartId: In(chartIds) });
    await charts.delete(chartIds);
  }

  it('persists normalized labels in stable order with database timestamps', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/size-charts')
      .send({
        name: `${runKey} Áo nam`,
        sizes: [' XS ', ' S ', ' M ', ' L ', ' XL '],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      id: expect.any(String),
      name: `${runKey} Áo nam`,
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      status: RecordStatus.ACTIVE,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(Date.parse(created.body.createdAt)).not.toBeNaN();
    await expect(
      items.find({
        where: { sizeChartId: created.body.id },
        order: { orderIndex: 'ASC' },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ sizeLabel: 'XS', orderIndex: 0 }),
      expect.objectContaining({ sizeLabel: 'S', orderIndex: 1 }),
      expect.objectContaining({ sizeLabel: 'M', orderIndex: 2 }),
      expect.objectContaining({ sizeLabel: 'L', orderIndex: 3 }),
      expect.objectContaining({ sizeLabel: 'XL', orderIndex: 4 }),
    ]);
  });

  it('updates the chart in place and atomically replaces its ordered labels', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/size-charts')
      .send({ name: `${runKey} Cập nhật`, sizes: ['S', 'M'] })
      .expect(201);
    const oldItemIds = (
      await items.find({ where: { sizeChartId: created.body.id } })
    ).map((item) => item.id);

    const updated = await request(app.getHttpServer())
      .patch(`/masters/size-charts/${created.body.id}`)
      .send({ sizes: ['M', 'L', 'XL'] })
      .expect(200);

    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body.sizes).toEqual(['M', 'L', 'XL']);
    await expect(items.countBy({ id: In(oldItemIds) })).resolves.toBe(0);
    await expect(
      items.find({
        where: { sizeChartId: created.body.id },
        order: { orderIndex: 'ASC' },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ sizeLabel: 'M', orderIndex: 0 }),
      expect.objectContaining({ sizeLabel: 'L', orderIndex: 1 }),
      expect.objectContaining({ sizeLabel: 'XL', orderIndex: 2 }),
    ]);
  });

  it('rejects duplicate normalized labels without changing stored data', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/size-charts')
      .send({ name: `${runKey} Duplicate`, sizes: ['S', 'M'] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/masters/size-charts/${created.body.id}`)
      .send({ sizes: ['L', ' l '] })
      .expect(400);

    const reloaded = await request(app.getHttpServer())
      .get(`/masters/size-charts/${created.body.id}`)
      .expect(200);
    expect(reloaded.body.sizes).toEqual(['S', 'M']);
  });

  it('allows only one concurrent create for names that normalize equally', async () => {
    const name = `${runKey} Concurrent`;
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/masters/size-charts')
        .send({ name, sizes: ['S'] }),
      request(app.getHttpServer())
        .post('/masters/size-charts')
        .send({ name: ` ${name.toUpperCase()} `, sizes: ['M'] }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    await expect(
      charts
        .createQueryBuilder('chart')
        .where('LOWER(BTRIM(chart.name)) = LOWER(BTRIM(:name))', { name })
        .getCount(),
    ).resolves.toBe(1);
  });

  it('excludes inactive charts from the active-only selector contract', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/size-charts')
      .send({ name: `${runKey} Inactive`, sizes: ['S'] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/masters/size-charts/${created.body.id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);

    const activeOnly = await request(app.getHttpServer())
      .get('/masters/size-charts?status=active')
      .expect(200);
    expect(
      activeOnly.body.some(
        (sizeChart: { id: string }) => sizeChart.id === created.body.id,
      ),
    ).toBe(false);
  });
});
