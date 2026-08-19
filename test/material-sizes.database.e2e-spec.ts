import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { Material } from '../src/features/master-data/entities/Material.entity';
import { MaterialSize } from '../src/features/master-data/entities/MaterialSize.entity';
import { Unit } from '../src/features/master-data/entities/Unit.entity';

const databaseE2e =
  process.env.RUN_DATABASE_E2E === 'true' ? describe : describe.skip;

databaseE2e('Material Sizes database API (e2e)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const materialIds: string[] = [];
  const unitIds: string[] = [];
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
    if (materialIds.length) {
      await dataSource
        .getRepository(MaterialSize)
        .delete({ materialId: In(materialIds) });
      await dataSource.getRepository(Material).delete({ id: In(materialIds) });
    }
    if (unitIds.length) {
      await dataSource.getRepository(Unit).delete({ id: In(unitIds) });
    }
    await app.close();
  });

  it('enforces normalized unique size codes and returns numeric fields', async () => {
    const unit = await dataSource.getRepository(Unit).save({
      code: `SIZE-U-${suffix}`.toUpperCase(),
      name: `Size unit ${suffix}`,
      decimalScale: 2,
      status: RecordStatus.ACTIVE,
    });
    unitIds.push(unit.id);
    const material = await dataSource.getRepository(Material).save({
      materialCode: `SIZE-MAT-${suffix}`.toUpperCase(),
      materialName: `Size material ${suffix}`,
      defaultUnitId: unit.id,
      status: RecordStatus.ACTIVE,
    });
    materialIds.push(material.id);

    const created = await request(app.getHttpServer())
      .post(`/masters/materials/${material.id}/sizes`)
      .send({
        sizeCode: ' m ',
        unitCost: 1.5,
        currentStock: 2,
        lowStockThreshold: 3,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      sizeCode: 'M',
      unitCost: 1.5,
      currentStock: 2,
      lowStockThreshold: 3,
    });
    expect(typeof created.body.currentStock).toBe('number');

    await request(app.getHttpServer())
      .post(`/masters/materials/${material.id}/sizes`)
      .send({ sizeCode: 'm' })
      .expect(409);
  });
});
