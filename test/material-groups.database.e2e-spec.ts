import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RecordStatus } from '../src/common/enums/database.enums';
import { MaterialGroup } from '../src/features/master-data/entities/MaterialGroup.entity';

const databaseE2e =
  process.env.RUN_DATABASE_E2E === 'true' ? describe : describe.skip;

databaseE2e('Material groups database API (e2e)', () => {
  const testSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reusedCode = `E2E-REUSED-${testSuffix}`.toUpperCase();
  const createdIds: string[] = [];
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
    if (createdIds.length > 0) {
      await dataSource.getRepository(MaterialGroup).delete({
        id: In(createdIds),
      });
    }
    await app.close();
  });

  it('supports the material group lifecycle and code reuse', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/masters/material-groups')
      .send({
        name: `E2E group ${testSuffix}`,
      })
      .expect(201);
    createdIds.push(createResponse.body.id);

    expect(createResponse.body).toMatchObject({
      status: RecordStatus.ACTIVE,
      displayOrder: 0,
    });

    const listedGroups = await request(app.getHttpServer())
      .get('/masters/material-groups?status=active')
      .expect(200);
    expect(listedGroups.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createResponse.body.id }),
      ]),
    );

    const updatedGroup = await request(app.getHttpServer())
      .patch(`/masters/material-groups/${createResponse.body.id}`)
      .send({
        code: reusedCode,
        name: `Updated E2E group ${testSuffix}`,
        displayOrder: 2,
      })
      .expect(200);
    expect(updatedGroup.body).toEqual(
      expect.objectContaining({ code: reusedCode, displayOrder: 2 }),
    );

    const inactiveGroup = await request(app.getHttpServer())
      .patch(`/masters/material-groups/${createResponse.body.id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);
    expect(inactiveGroup.body).toEqual(
      expect.objectContaining({ status: RecordStatus.INACTIVE }),
    );

    const activeGroups = await request(app.getHttpServer())
      .get('/masters/material-groups?status=active')
      .expect(200);
    expect(activeGroups.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createResponse.body.id }),
      ]),
    );

    await request(app.getHttpServer())
      .delete(`/masters/material-groups/${createResponse.body.id}`)
      .expect(204);
    createdIds.splice(createdIds.indexOf(createResponse.body.id), 1);

    const reusedResponse = await request(app.getHttpServer())
      .post('/masters/material-groups')
      .send({ code: reusedCode, name: `Reused E2E group ${testSuffix}` })
      .expect(201);
    createdIds.push(reusedResponse.body.id);

    expect(reusedResponse.body.code).toBe(reusedCode);
  });
});
