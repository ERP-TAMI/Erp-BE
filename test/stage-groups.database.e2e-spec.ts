import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { RecordStatus } from '../src/common/enums/database.enums';
import {
  STAGE_GROUP_SEEDS,
  seedStageGroups,
} from '../src/database/seeds/seed-stage-groups';
import { Stage } from '../src/features/master-data/entities/Stage.entity';
import { StageGroup } from '../src/features/master-data/entities/StageGroup.entity';
import { StageGroupItem } from '../src/features/master-data/entities/StageGroupItem.entity';

describe('Stage groups API with PostgreSQL (e2e)', () => {
  const runKey = `TST-SG-${process.pid}`;
  const groupCodePrefix = `${runKey}-G`;
  const stageCodePrefix = `${runKey}-S`;
  let app: INestApplication;
  let dataSource: DataSource;
  let groups: Repository<StageGroup>;
  let items: Repository<StageGroupItem>;
  let stages: Repository<Stage>;
  let firstStage: Stage;
  let secondStage: Stage;

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
    groups = dataSource.getRepository(StageGroup);
    items = dataSource.getRepository(StageGroupItem);
    stages = dataSource.getRepository(Stage);
    await cleanupTestRows();
    [firstStage, secondStage] = await stages.save([
      stages.create({
        stageCode: `${stageCodePrefix}-1`,
        stageName: `${runKey} May thân`,
        description: 'May ráp thân',
        defaultSsv: '12.500',
        status: RecordStatus.ACTIVE,
      }),
      stages.create({
        stageCode: `${stageCodePrefix}-2`,
        stageName: `${runKey} Cắt vải`,
        description: 'Cắt chi tiết',
        defaultSsv: '8.000',
        status: RecordStatus.ACTIVE,
      }),
    ]);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await cleanupTestRows();
    if (app) await app.close();
  });

  async function cleanupTestRows(): Promise<void> {
    const testGroups = await groups.find({
      select: { id: true },
      where: [
        { groupCode: Like(`${groupCodePrefix}%`) },
        { groupName: Like(`${runKey}%`) },
      ],
    });
    const testStages = await stages.find({
      select: { id: true },
      where: { stageCode: Like(`${stageCodePrefix}%`) },
    });
    if (testStages.length > 0) {
      await items.delete({ stageId: In(testStages.map((stage) => stage.id)) });
    }
    if (testGroups.length > 0) {
      await items.delete(
        testGroups.map((group) => ({ stageGroupId: group.id })),
      );
      await groups.delete(testGroups.map((group) => group.id));
    }
    await stages.delete({ stageCode: Like(`${stageCodePrefix}%`) });
  }

  it('persists timestamps and returns the same ordered items before and after reload', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-ORDER`,
        groupName: `${runKey} Nhóm thứ tự`,
        items: [
          { stageId: firstStage.id, orderIndex: 1 },
          { stageId: secondStage.id, orderIndex: 0 },
        ],
      })
      .expect(201);

    expect(Date.parse(createResponse.body.createdAt)).not.toBeNaN();
    expect(Date.parse(createResponse.body.updatedAt)).not.toBeNaN();
    expect(
      createResponse.body.items.map(
        (item: { orderIndex: number }) => item.orderIndex,
      ),
    ).toEqual([0, 1]);

    const detailResponse = await request(app.getHttpServer())
      .get(`/masters/stage-groups/${createResponse.body.id}`)
      .expect(200);
    expect(
      detailResponse.body.items.map(
        (item: { orderIndex: number }) => item.orderIndex,
      ),
    ).toEqual([0, 1]);
  });

  it('rejects null required update fields and allows clearing description', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-NULL`,
        groupName: `${runKey} Nhóm null`,
        description: 'Có mô tả',
        items: [{ stageId: firstStage.id, orderIndex: 0 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${created.body.id}`)
      .send({ groupName: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${created.body.id}`)
      .send({ items: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${created.body.id}`)
      .send({ description: null })
      .expect(200)
      .expect((response) => expect(response.body.description).toBeNull());
  });

  it('keeps item snapshots stable when the source stage changes', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-SNAPSHOT`,
        groupName: `${runKey} Nhóm snapshot`,
        items: [{ stageId: firstStage.id, orderIndex: 0 }],
      })
      .expect(201);

    const originalName = firstStage.stageName;
    const originalDescription = firstStage.description;
    const originalSsv = firstStage.defaultSsv;
    await stages.update(firstStage.id, {
      stageName: `${runKey} Tên đã đổi`,
      description: 'Mô tả đã đổi',
      defaultSsv: '99.000',
    });

    const detail = await request(app.getHttpServer())
      .get(`/masters/stage-groups/${created.body.id}`)
      .expect(200);
    expect(detail.body.items[0]).toMatchObject({
      stageName: originalName,
      description: originalDescription,
      ssv: originalSsv,
    });

    await stages.update(firstStage.id, {
      stageName: originalName,
      description: originalDescription,
      defaultSsv: originalSsv,
    });
  });

  it('deletes an unreferenced group and cascades its child items', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-DELETE`,
        groupName: `${runKey} Nhóm cần xóa`,
        items: [{ stageId: firstStage.id, orderIndex: 0 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/masters/stage-groups/${created.body.id}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/masters/stage-groups/${created.body.id}`)
      .expect(404);
    await expect(
      items.countBy({ stageGroupId: created.body.id }),
    ).resolves.toBe(0);
  });

  it('creates distinct generated codes under concurrent requests', async () => {
    const payload = {
      groupName: `${runKey} Nhóm đồng thời`,
      items: [{ stageId: firstStage.id, orderIndex: 0 }],
    };
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/masters/stage-groups').send(payload),
      request(app.getHttpServer()).post('/masters/stage-groups').send(payload),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(
      new Set(responses.map((response) => response.body.groupCode)).size,
    ).toBe(2);
  });

  it('seeds the complete catalog idempotently against PostgreSQL', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await seedStageGroups(runner.manager);
      await seedStageGroups(runner.manager);
      const counts = (await runner.manager.query(
        `SELECT groups.group_code, COUNT(items.stage_id)::integer AS item_count
         FROM stage_groups groups
         LEFT JOIN stage_group_items items ON items.stage_group_id = groups.id
         WHERE groups.group_code = ANY($1::text[])
         GROUP BY groups.group_code
         ORDER BY groups.group_code`,
        [STAGE_GROUP_SEEDS.map((group) => group.groupCode)],
      )) as Array<{ group_code: string; item_count: number }>;

      expect(
        new Map(counts.map((row) => [row.group_code, row.item_count])),
      ).toEqual(
        new Map(
          STAGE_GROUP_SEEDS.map((group) => [
            group.groupCode,
            group.items.length,
          ]),
        ),
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('rolls back the seed when a generated stage code belongs to another stage name', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.manager.query(
        `INSERT INTO stages (stage_code, stage_name, description, default_ssv, status)
         VALUES ($1, $2, NULL, 10, 'active'::record_status)
         ON CONFLICT (stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name`,
        ['GD-MAY-LUNG-HC', `${runKey} Công đoạn xung đột`],
      );

      await expect(seedStageGroups(runner.manager)).rejects.toThrow(
        /GD-MAY-LUNG-HC/,
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
