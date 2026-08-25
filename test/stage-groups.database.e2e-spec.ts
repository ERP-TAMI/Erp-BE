import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, Like, Repository } from 'typeorm';
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

type ChildResponse = {
  id: string;
  itemName: string;
  description: string | null;
  ssv: string;
  status: RecordStatus;
  orderIndex: number;
};

describe('Stage groups API with PostgreSQL (e2e)', () => {
  const runKey = `TST-SG-${process.pid}`;
  const groupCodePrefix = `${runKey}-G`;
  let app: INestApplication;
  let dataSource: DataSource;
  let groups: Repository<StageGroup>;
  let items: Repository<StageGroupItem>;

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
    await cleanupTestRows();
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
    if (testGroups.length === 0) return;
    await items.delete(testGroups.map((group) => ({ stageGroupId: group.id })));
    await groups.delete(testGroups.map((group) => group.id));
  }

  it('persists independent children with stable IDs and ordered reloads', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-ORDER`,
        groupName: `${runKey} Nhóm thứ tự`,
        items: [
          {
            itemName: 'May thân',
            description: 'May ráp thân',
            ssv: '12.500',
            orderIndex: 1,
          },
          {
            itemName: 'Cắt vải',
            description: null,
            ssv: '8.000',
            orderIndex: 0,
          },
        ],
      })
      .expect(201);

    expect(Date.parse(created.body.createdAt)).not.toBeNaN();
    expect(created.body.items).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        itemName: 'Cắt vải',
        ssv: '8.000',
        status: RecordStatus.ACTIVE,
        orderIndex: 0,
      }),
      expect.objectContaining({
        id: expect.any(String),
        itemName: 'May thân',
        ssv: '12.500',
        status: RecordStatus.ACTIVE,
        orderIndex: 1,
      }),
    ]);

    const originalIds = created.body.items.map(
      (item: ChildResponse) => item.id,
    );
    const detail = await request(app.getHttpServer())
      .get(`/masters/stage-groups/${created.body.id}`)
      .expect(200);
    expect(detail.body.items.map((item: ChildResponse) => item.id)).toEqual(
      originalIds,
    );
  });

  it('updates, reorders, removes, and creates children atomically by child ID', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-RECONCILE`,
        groupName: `${runKey} Nhóm cập nhật`,
        items: [
          { itemName: 'Giữ lại', ssv: '10.000', orderIndex: 0 },
          { itemName: 'Loại bỏ', ssv: '11.000', orderIndex: 1 },
        ],
      })
      .expect(201);
    const retainedId = created.body.items[0].id as string;
    const removedId = created.body.items[1].id as string;

    const updated = await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${created.body.id}`)
      .send({
        items: [
          {
            itemName: 'Công đoạn mới',
            description: 'Tạo trực tiếp trong nhóm',
            ssv: '7.250',
            status: RecordStatus.ACTIVE,
            orderIndex: 0,
          },
          {
            id: retainedId,
            itemName: 'Giữ lại đã sửa',
            description: null,
            ssv: '15.500',
            status: RecordStatus.INACTIVE,
            orderIndex: 1,
          },
        ],
      })
      .expect(200);

    expect(updated.body.items).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        itemName: 'Công đoạn mới',
        orderIndex: 0,
      }),
      expect.objectContaining({
        id: retainedId,
        itemName: 'Giữ lại đã sửa',
        ssv: '15.500',
        status: RecordStatus.INACTIVE,
        orderIndex: 1,
      }),
    ]);
    expect(updated.body.items[0].id).not.toBe(retainedId);
    await expect(items.findOneBy({ id: removedId })).resolves.toBeNull();
  });

  it('rejects a child ID owned by another group without changing either group', async () => {
    const first = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-OWNER-A`,
        groupName: `${runKey} Nhóm A`,
        items: [{ itemName: 'Con A', ssv: '1.000', orderIndex: 0 }],
      })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-OWNER-B`,
        groupName: `${runKey} Nhóm B`,
        items: [{ itemName: 'Con B', ssv: '2.000', orderIndex: 0 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${first.body.id}`)
      .send({
        items: [
          {
            id: second.body.items[0].id,
            itemName: 'Không thuộc nhóm A',
            ssv: '3.000',
            orderIndex: 0,
          },
        ],
      })
      .expect(400);

    const reloaded = await request(app.getHttpServer())
      .get(`/masters/stage-groups/${first.body.id}`)
      .expect(200);
    expect(reloaded.body.items).toEqual(first.body.items);
  });

  it('deletes an unreferenced group and cascades its child items', async () => {
    const created = await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: `${groupCodePrefix}-DELETE`,
        groupName: `${runKey} Nhóm cần xóa`,
        items: [{ itemName: 'Con sẽ xóa', ssv: '5.000', orderIndex: 0 }],
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
      items: [{ itemName: 'Con độc lập', ssv: '1.000', orderIndex: 0 }],
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

  it('seeds 3 groups and 54 children idempotently without touching Stage Master', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const stageCountBefore = await runner.manager.count(Stage);
      await seedStageGroups(runner.manager);
      await seedStageGroups(runner.manager);
      const stageCountAfter = await runner.manager.count(Stage);
      const counts = (await runner.manager.query(
        `SELECT groups.group_code, COUNT(items.id)::integer AS item_count
         FROM stage_groups groups
         LEFT JOIN stage_group_items items ON items.stage_group_id = groups.id
         WHERE groups.group_code = ANY($1::text[])
         GROUP BY groups.group_code
         ORDER BY groups.group_code`,
        [STAGE_GROUP_SEEDS.map((group) => group.groupCode)],
      )) as Array<{ group_code: string; item_count: number }>;
      const specialRow = (await runner.manager.query(
        `SELECT items.item_name, items.description, items.ssv::text,
                items.status::text, items.order_index
         FROM stage_group_items items
         JOIN stage_groups groups ON groups.id = items.stage_group_id
         WHERE groups.group_code = 'NS-VAT-SO' AND items.order_index = 16`,
      )) as Array<{
        item_name: string;
        description: string;
        ssv: string;
        status: string;
        order_index: number;
      }>;

      expect(stageCountAfter).toBe(stageCountBefore);
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
      expect(specialRow).toEqual([
        {
          item_name: 'VS3C DTS (định hình/đáp túi sau)',
          description: 'VS3C DTS',
          ssv: '10.000',
          status: RecordStatus.ACTIVE,
          order_index: 16,
        },
      ]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
