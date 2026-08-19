import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { MaterialSizesController } from '../src/modules/master-data/material-sizes/material-sizes.controller';
import { MaterialSizesService } from '../src/modules/master-data/material-sizes/material-sizes.service';

describe('Material Sizes API (e2e)', () => {
  const materialId = 'c5ab824e-8e6d-42b0-8d9d-a02d34762d40';
  const sizeId = '33b27a8c-d43d-46f6-a3c4-e40ae72ef3e8';
  const size = {
    id: sizeId,
    materialId,
    sizeCode: 'M',
    barcode: null,
    unitCost: 0,
    currentStock: 0,
    lowStockThreshold: 10,
    status: RecordStatus.ACTIVE,
  };
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
  };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [MaterialSizesController],
      providers: [{ provide: MaterialSizesService, useValue: service }],
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

  it('normalizes and creates a material size', async () => {
    service.create.mockResolvedValue(size);

    await request(app.getHttpServer())
      .post(`/masters/materials/${materialId}/sizes`)
      .send({ sizeCode: ' m ', barcode: '123', currentStock: 2 })
      .expect(201)
      .expect(size);

    expect(service.create).toHaveBeenCalledWith(materialId, {
      sizeCode: 'M',
      barcode: '123',
      currentStock: 2,
    });
  });

  it.each([
    [{ sizeCode: '', currentStock: 0 }],
    [{ sizeCode: 'M', currentStock: -1 }],
    [{ sizeCode: 'M', unexpected: true }],
  ])('rejects invalid create payload %p', async (payload) => {
    await request(app.getHttpServer())
      .post(`/masters/materials/${materialId}/sizes`)
      .send(payload)
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('validates partial update payloads', async () => {
    await request(app.getHttpServer())
      .patch(`/masters/materials/${materialId}/sizes/${sizeId}`)
      .send({ lowStockThreshold: -1 })
      .expect(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('validates UUID path parameters', async () => {
    await request(app.getHttpServer())
      .get('/masters/materials/not-a-uuid/sizes')
      .expect(400);
  });

  it('updates status and deletes through the HTTP API', async () => {
    service.updateStatus.mockResolvedValue({
      ...size,
      status: RecordStatus.INACTIVE,
    });
    service.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .patch(`/masters/materials/${materialId}/sizes/${sizeId}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/masters/materials/${materialId}/sizes/${sizeId}`)
      .expect(204);
  });
});
