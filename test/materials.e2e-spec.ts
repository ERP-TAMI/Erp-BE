import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RecordStatus } from '../src/common/enums/database.enums';
import { MaterialsController } from '../src/modules/master-data/materials/controllers/materials.controller';
import { MaterialsService } from '../src/modules/master-data/materials/services/materials.service';

describe('Materials API (e2e)', () => {
  const id = 'c5ab824e-8e6d-42b0-8d9d-a02d34762d40';
  const groupId = 'c6df31f6-7df0-43d1-a5e7-03fa5087bf90';
  const material = {
    id,
    materialCode: 'COTTON',
    materialName: 'Cotton',
    materialGroupId: groupId,
    status: RecordStatus.ACTIVE,
  };
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
  };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [{ provide: MaterialsService, useValue: service }],
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
  afterEach(async () => app.close());

  it('normalizes and creates a material through the HTTP API', async () => {
    service.create.mockResolvedValue(material);
    await request(app.getHttpServer())
      .post('/masters/materials')
      .send({
        materialCode: ' cotton ',
        materialName: ' Cotton ',
        materialGroupId: groupId,
      })
      .expect(201)
      .expect(material);
    expect(service.create).toHaveBeenCalledWith({
      materialCode: 'COTTON',
      materialName: 'Cotton',
      materialGroupId: groupId,
    });
  });

  it('rejects invalid material-group input before it reaches the service', async () => {
    await request(app.getHttpServer())
      .post('/masters/materials')
      .send({
        materialCode: 'COTTON',
        materialName: 'Cotton',
        materialGroupId: 'not-a-uuid',
      })
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
