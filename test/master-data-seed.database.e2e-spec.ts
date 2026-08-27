import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import {
  MATERIAL_GROUP_SEEDS,
  MATERIAL_SEEDS,
  SIZE_CHART_SEEDS,
  STABLE_SAMPLE_IDS,
} from '../src/database/seeds/sample-master-data';
import { seedSampleMasterData } from '../src/database/seeds/seed-master-data';
import { SizeChart } from '../src/features/master-data/entities/SizeChart.entity';

const databaseE2e =
  process.env.RUN_DATABASE_E2E === 'true' ? describe : describe.skip;

databaseE2e('Sample Master Data contract with PostgreSQL (e2e)', () => {
  let authenticatedApp: INestApplication;
  let unauthenticatedApp: INestApplication;
  let dataSource: DataSource;
  let revisionId: string | undefined;

  const configureApp = (app: INestApplication): void => {
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
  };

  beforeAll(async () => {
    const authenticatedModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    authenticatedApp = authenticatedModule.createNestApplication();
    configureApp(authenticatedApp);
    await authenticatedApp.init();
    dataSource = authenticatedApp.get(DataSource);

    await seedSampleMasterData(dataSource, {
      reset: true,
      nodeEnv: 'test',
    });

    const unauthenticatedModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    unauthenticatedApp = unauthenticatedModule.createNestApplication();
    configureApp(unauthenticatedApp);
    await unauthenticatedApp.init();
  }, 60000);

  afterAll(async () => {
    if (revisionId && dataSource?.isInitialized) {
      await dataSource.getRepository(SizeChart).delete(revisionId);
    }
    if (unauthenticatedApp) await unauthenticatedApp.close();
    if (authenticatedApp) await authenticatedApp.close();
  });

  it.each([
    '/masters/material-groups',
    '/masters/materials',
    '/masters/stages',
    '/masters/stage-groups',
    '/masters/workshops',
    '/masters/size-charts',
  ])('requires authentication for GET %s', async (path) => {
    await request(unauthenticatedApp.getHttpServer()).get(path).expect(401);
  });

  it('exposes stable IDs and resolved material references for Fit selectors', async () => {
    const groups = await request(authenticatedApp.getHttpServer())
      .get('/masters/material-groups?status=active')
      .expect(200);
    expect(groups.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: STABLE_SAMPLE_IDS.materialGroups.FUSIBLE,
          name: 'FUSIBLE',
        }),
      ]),
    );

    const materials = await request(authenticatedApp.getHttpServer())
      .get('/masters/materials?status=active')
      .expect(200);
    expect(materials.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: STABLE_SAMPLE_IDS.materials['FUS-BLK'],
          materialCode: 'FUS-BLK',
          materialGroupId: STABLE_SAMPLE_IDS.materialGroups.FUSIBLE,
          defaultUnitName: 'Mét',
        }),
      ]),
    );

    const charts = await request(authenticatedApp.getHttpServer())
      .get('/masters/size-charts?status=active')
      .expect(200);
    expect(charts.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: STABLE_SAMPLE_IDS.sizeCharts['Size chữ tiêu chuẩn'],
          sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
        }),
      ]),
    );
  });

  it('returns 409 when a seeded material references its group', async () => {
    await request(authenticatedApp.getHttpServer())
      .delete(
        `/masters/material-groups/${STABLE_SAMPLE_IDS.materialGroups.FUSIBLE}`,
      )
      .expect(409);
  });

  it('returns 409 when a revision references a seeded Size Chart', async () => {
    const parentId = STABLE_SAMPLE_IDS.sizeCharts['Size chữ tiêu chuẩn'];
    const revision = await dataSource.getRepository(SizeChart).save({
      name: `E2E revision ${process.pid}`,
      status: RecordStatus.ACTIVE,
      revisionNo: 2,
      supersedesId: parentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    revisionId = revision.id;

    await request(authenticatedApp.getHttpServer())
      .delete(`/masters/size-charts/${parentId}`)
      .expect(409);
  });

  it('created exactly the maintained catalog after reset', async () => {
    await seedSampleMasterData(dataSource);

    await expect(
      dataSource.query(
        `SELECT COUNT(*)::integer AS count FROM materials
         WHERE material_code = ANY($1::text[])`,
        [MATERIAL_SEEDS.map((seed) => seed.materialCode)],
      ),
    ).resolves.toEqual([{ count: MATERIAL_SEEDS.length }]);
    await expect(
      dataSource.query(
        `SELECT COUNT(*)::integer AS count FROM material_groups
         WHERE LOWER(BTRIM(name)) = ANY($1::text[])`,
        [MATERIAL_GROUP_SEEDS.map((seed) => seed.name.toLocaleLowerCase('vi'))],
      ),
    ).resolves.toEqual([{ count: MATERIAL_GROUP_SEEDS.length }]);
    await expect(
      dataSource.query(
        `SELECT COUNT(*)::integer AS count FROM size_charts
         WHERE LOWER(BTRIM(name)) = ANY($1::text[])`,
        [SIZE_CHART_SEEDS.map((seed) => seed.name.toLocaleLowerCase('vi'))],
      ),
    ).resolves.toEqual([{ count: SIZE_CHART_SEEDS.length }]);
    await expect(
      dataSource.query(
        `SELECT COUNT(*)::integer AS count
         FROM size_chart_items
         JOIN size_charts ON size_charts.id = size_chart_items.size_chart_id
         WHERE LOWER(BTRIM(size_charts.name)) = ANY($1::text[])`,
        [SIZE_CHART_SEEDS.map((seed) => seed.name.toLocaleLowerCase('vi'))],
      ),
    ).resolves.toEqual([
      {
        count: SIZE_CHART_SEEDS.reduce(
          (count, chart) => count + chart.sizes.length,
          0,
        ),
      },
    ]);
  });
});
