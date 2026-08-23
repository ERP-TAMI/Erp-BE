import {
  ConflictException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RecordStatus } from '../src/common/enums/database.enums';
import { MaterialGroupsController } from '../src/features/master-data/material-groups/material-groups.controller';
import { MaterialGroupsService } from '../src/features/master-data/material-groups/material-groups.service';

describe('Material groups API (e2e)', () => {
  const id = '9fb4d58f-0e6d-4ed5-b122-2b9f61aae115';
  const group = {
    id,
    name: 'Fabric',
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
      .send({ name: ' Fabric ' })
      .expect(201)
      .expect(group);

    expect(materialGroupsService.create).toHaveBeenCalledWith({
      name: 'Fabric',
    });
  });

  it('lists active material groups for new-material selectors', async () => {
    materialGroupsService.findAll.mockResolvedValue([group]);

    await request(app.getHttpServer())
      .get('/masters/material-groups?status=active')
      .expect(200)
      .expect([group]);

    expect(materialGroupsService.findAll).toHaveBeenCalledWith({
      status: RecordStatus.ACTIVE,
    });
  });

  it('returns material group detail through the HTTP API', async () => {
    materialGroupsService.findOne.mockResolvedValue(group);

    await request(app.getHttpServer())
      .get(`/masters/material-groups/${id}`)
      .expect(200)
      .expect(group);

    expect(materialGroupsService.findOne).toHaveBeenCalledWith(id);
  });

  it('updates a material group through the HTTP API', async () => {
    const updatedGroup = {
      ...group,
      name: 'Main fabric',
    };
    materialGroupsService.update.mockResolvedValue(updatedGroup);

    await request(app.getHttpServer())
      .patch(`/masters/material-groups/${id}`)
      .send({ name: ' Main fabric ' })
      .expect(200)
      .expect(updatedGroup);

    expect(materialGroupsService.update).toHaveBeenCalledWith(id, {
      name: 'Main fabric',
    });
  });

  it('rejects invalid input before it reaches the service', async () => {
    await request(app.getHttpServer())
      .post('/masters/material-groups')
      .send({ name: 'Fabric', ignored: true })
      .expect(400);

    expect(materialGroupsService.create).not.toHaveBeenCalled();
  });

  it('requires a name', async () => {
    await request(app.getHttpServer())
      .post('/masters/material-groups')
      .send({ name: '   ' })
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

  it('returns conflict when a material reference prevents hard deletion', async () => {
    materialGroupsService.remove.mockRejectedValue(
      new ConflictException(
        'Material group cannot be deleted because materials reference it',
      ),
    );

    await request(app.getHttpServer())
      .delete(`/masters/material-groups/${id}`)
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'CONFLICT',
          statusCode: 409,
        });
      });
  });
});
