import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { Material } from '../src/features/master-data/entities/Material.entity';
import { MaterialGroup } from '../src/features/master-data/entities/MaterialGroup.entity';
import { MaterialSize } from '../src/features/master-data/entities/MaterialSize.entity';
import { Unit } from '../src/features/master-data/entities/Unit.entity';

const databaseE2e =
  process.env.RUN_DATABASE_E2E === 'true' ? describe : describe.skip;

databaseE2e('Materials database API (e2e)', () => {
  const testSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const materialIds: string[] = [];
  const materialGroupIds: string[] = [];
  const materialSizeIds: string[] = [];
  const unitIds: string[] = [];
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
  }, 30000);

  afterAll(async () => {
    if (materialSizeIds.length > 0) {
      await dataSource.getRepository(MaterialSize).delete({
        id: In(materialSizeIds),
      });
    }
    if (materialIds.length > 0) {
      await dataSource.getRepository(Material).delete({ id: In(materialIds) });
    }
    if (materialGroupIds.length > 0) {
      await dataSource.getRepository(MaterialGroup).delete({
        id: In(materialGroupIds),
      });
    }
    if (unitIds.length > 0) {
      await dataSource.getRepository(Unit).delete({ id: In(unitIds) });
    }
    await app.close();
  });

  it('supports filtering, status changes, and reference-safe deletion', async () => {
    const materialGroup = await dataSource.getRepository(MaterialGroup).save({
      name: `E2E Fabric ${testSuffix}`,
      status: RecordStatus.ACTIVE,
    });
    materialGroupIds.push(materialGroup.id);

    const unit = await dataSource.getRepository(Unit).save({
      name: `E2E Meter ${testSuffix}`.slice(0, 100),
      status: RecordStatus.ACTIVE,
    });
    unitIds.push(unit.id);

    const createResponse = await request(app.getHttpServer())
      .post('/masters/materials')
      .send({
        materialCode: ` e2e-${testSuffix} `,
        materialName: ` E2E Main fabric ${testSuffix} `,
        materialGroupId: materialGroup.id,
        defaultUnitId: unit.id,
        defaultYieldPct: '2.5000',
      })
      .expect(201);
    materialIds.push(createResponse.body.id);

    expect(createResponse.body).toMatchObject({
      materialCode: `E2E-${testSuffix}`.toUpperCase(),
      materialName: `E2E Main fabric ${testSuffix}`,
      materialGroupId: materialGroup.id,
      materialGroupName: materialGroup.name,
      defaultUnitId: unit.id,
      defaultUnitName: unit.name,
      defaultYieldPct: '2.5000',
      status: RecordStatus.ACTIVE,
    });

    const filteredMaterials = await request(app.getHttpServer())
      .get(
        `/masters/materials?search=${testSuffix}&materialGroupId=${materialGroup.id}&status=active`,
      )
      .expect(200);
    expect(filteredMaterials.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createResponse.body.id }),
      ]),
    );

    await request(app.getHttpServer())
      .patch(`/masters/materials/${createResponse.body.id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: RecordStatus.INACTIVE,
        });
      });

    const activeMaterials = await request(app.getHttpServer())
      .get('/masters/materials?status=active')
      .expect(200);
    expect(activeMaterials.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createResponse.body.id }),
      ]),
    );

    const materialSize = await dataSource.getRepository(MaterialSize).save({
      materialId: createResponse.body.id,
      sizeCode: `E2E-${testSuffix}`.slice(0, 20),
      unitCost: 0,
      currentStock: 0,
      lowStockThreshold: 10,
      status: RecordStatus.ACTIVE,
    });
    materialSizeIds.push(materialSize.id);

    await request(app.getHttpServer())
      .delete(`/masters/materials/${createResponse.body.id}`)
      .expect(409);

    await dataSource.getRepository(MaterialSize).delete(materialSize.id);
    materialSizeIds.splice(materialSizeIds.indexOf(materialSize.id), 1);

    await request(app.getHttpServer())
      .delete(`/masters/materials/${createResponse.body.id}`)
      .expect(204);
    materialIds.splice(materialIds.indexOf(createResponse.body.id), 1);

    await request(app.getHttpServer())
      .get(`/masters/materials/${createResponse.body.id}`)
      .expect(404);
  });
});
