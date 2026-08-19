import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RecordStatus } from '../src/common/enums/database.enums';
import { Material } from '../src/features/master-data/entities/Material.entity';
import { MaterialGroup } from '../src/features/master-data/entities/MaterialGroup.entity';
import { Unit } from '../src/features/master-data/entities/Unit.entity';

const databaseE2e =
  process.env.RUN_DATABASE_E2E === 'true' ? describe : describe.skip;

databaseE2e('Materials database API (e2e)', () => {
  const testSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const materialCode = `MAT-${testSuffix}`.toUpperCase();
  const createdMaterialIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdUnitIds: string[] = [];
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  }, 30000);

  afterAll(async () => {
    if (createdMaterialIds.length > 0) {
      await dataSource.getRepository(Material).delete({
        id: In(createdMaterialIds),
      });
    }
    if (createdGroupIds.length > 0) {
      await dataSource.getRepository(MaterialGroup).delete({
        id: In(createdGroupIds),
      });
    }
    if (createdUnitIds.length > 0) {
      await dataSource.getRepository(Unit).delete({ id: In(createdUnitIds) });
    }
    await app.close();
  });

  it('creates, filters, updates, changes status, and deletes a material', async () => {
    const unit = await dataSource.getRepository(Unit).save({
      code: `U-${testSuffix}`.toUpperCase(),
      name: `Unit ${testSuffix}`,
      decimalScale: 2,
      status: RecordStatus.ACTIVE,
    });
    createdUnitIds.push(unit.id);

    const group = await dataSource.getRepository(MaterialGroup).save({
      code: `G-${testSuffix}`.toUpperCase(),
      name: `Group ${testSuffix}`,
      displayOrder: 0,
      status: RecordStatus.ACTIVE,
    });
    createdGroupIds.push(group.id);

    const created = await request(app.getHttpServer())
      .post('/masters/materials')
      .send({
        materialCode: materialCode.toLowerCase(),
        materialName: `Material ${testSuffix}`,
        materialGroupId: group.id,
        defaultUnitId: unit.id,
        defaultYieldPct: 1.25,
        lastUnitCost: 25000,
        currentStock: 15.5,
        lowStockThreshold: 3,
      })
      .expect(201);
    createdMaterialIds.push(created.body.id);

    expect(created.body).toMatchObject({
      materialCode,
      materialGroupId: group.id,
      defaultUnitId: unit.id,
      currentStock: 15.5,
      status: RecordStatus.ACTIVE,
    });

    const filtered = await request(app.getHttpServer())
      .get(
        `/masters/materials?search=${encodeURIComponent(testSuffix)}&materialGroupId=${group.id}&status=active`,
      )
      .expect(200);
    expect(filtered.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id, materialCode }),
      ]),
    );

    await request(app.getHttpServer())
      .patch(`/masters/materials/${created.body.id}`)
      .send({ currentStock: 20, lowStockThreshold: 5 })
      .expect(200)
      .expect(
        expect.objectContaining({ currentStock: 20, lowStockThreshold: 5 }),
      );

    await request(app.getHttpServer())
      .patch(`/masters/materials/${created.body.id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200)
      .expect(expect.objectContaining({ status: RecordStatus.INACTIVE }));

    await request(app.getHttpServer())
      .delete(`/masters/materials/${created.body.id}`)
      .expect(204);
    createdMaterialIds.splice(createdMaterialIds.indexOf(created.body.id), 1);
  });
});
