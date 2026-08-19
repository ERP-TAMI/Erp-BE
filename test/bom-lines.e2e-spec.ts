import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { BomLinesController } from '../src/modules/production/bom-lines/controllers/bom-lines.controller';
import { BomLinesService } from '../src/modules/production/bom-lines/services/bom-lines.service';

describe('BOM Lines API (e2e)', () => {
  const bomId = 'dc3a787f-aa4a-43ee-86c9-67871fdf6224';
  const materialId = 'c5ab824e-8e6d-42b0-8d9d-a02d34762d40';
  const service = { list: jest.fn(), create: jest.fn() };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [BomLinesController],
      providers: [{ provide: BomLinesService, useValue: service }],
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

  it('accepts the minimal add-line contract', async () => {
    service.create.mockResolvedValue({ id: 'line-id' });
    await request(app.getHttpServer())
      .post(`/boms/${bomId}/lines`)
      .send({ materialId, consumptionPerUnit: 1.5, orderIndex: 0 })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(bomId, {
      materialId,
      consumptionPerUnit: 1.5,
      orderIndex: 0,
    });
  });

  it.each([
    [{ materialId: 'not-a-uuid', consumptionPerUnit: 1, orderIndex: 0 }],
    [{ materialId, consumptionPerUnit: 0, orderIndex: 0 }],
    [{ materialId, consumptionPerUnit: 1, unitCost: 0, orderIndex: 0 }],
    [{ materialId, consumptionPerUnit: 1, orderIndex: -1 }],
  ])('rejects invalid payload %p', async (payload) => {
    await request(app.getHttpServer())
      .post(`/boms/${bomId}/lines`)
      .send(payload)
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
