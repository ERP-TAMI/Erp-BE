import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RecordStatus } from '../src/common/enums/database.enums';
import { MaterialGroupsController } from '../src/modules/master-data/material-groups/controllers/material-groups.controller';
import { MaterialGroupsService } from '../src/modules/master-data/material-groups/services/material-groups.service';

describe('Material groups API (e2e)', () => {
  const id = '9fb4d58f-0e6d-4ed5-b122-2b9f61aae115';
  const group = {
    id,
    code: 'FABRIC',
    name: 'Fabric',
    displayOrder: 0,
    status: RecordStatus.ACTIVE,
  };
  const materialGroupsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
  };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [MaterialGroupsController],
      providers: [
        { provide: MaterialGroupsService, useValue: materialGroupsService },
      ],
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
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a material group through the HTTP API', async () => {
    materialGroupsService.create.mockResolvedValue(group);

    await request(app.getHttpServer())
      .post('/masters/material-groups')
      .send({ code: ' fabric ', name: ' Fabric ', displayOrder: 0 })
      .expect(201)
      .expect(group);

    expect(materialGroupsService.create).toHaveBeenCalledWith({
      code: 'FABRIC',
      name: 'Fabric',
      displayOrder: 0,
    });
  });

  it('rejects invalid input before it reaches the service', async () => {
    await request(app.getHttpServer())
      .post('/masters/material-groups')
      .send({ code: '', name: 'Fabric', displayOrder: -1, ignored: true })
      .expect(400);

    expect(materialGroupsService.create).not.toHaveBeenCalled();
  });

  it('changes status through its dedicated endpoint', async () => {
    materialGroupsService.updateStatus.mockResolvedValue({
      ...group,
      status: RecordStatus.INACTIVE,
    });

    await request(app.getHttpServer())
      .patch(`/masters/material-groups/${id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200)
      .expect({ ...group, status: RecordStatus.INACTIVE });

    expect(materialGroupsService.updateStatus).toHaveBeenCalledWith(id, {
      status: RecordStatus.INACTIVE,
    });
  });
});
