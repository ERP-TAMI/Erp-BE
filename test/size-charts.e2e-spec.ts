import {
  BadRequestException,
  ConflictException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { SizeChartsController } from '../src/features/master-data/size-charts/size-charts.controller';
import { SizeChartsService } from '../src/features/master-data/size-charts/size-charts.service';

describe('Size Charts API (e2e)', () => {
  const id = '0cf40521-6666-4cc1-b6f7-f91346350255';
  const chart = {
    id,
    name: 'Size áo nam',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    status: RecordStatus.ACTIVE,
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
  };
  const sizeChartsService = {
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
      controllers: [SizeChartsController],
      providers: [{ provide: SizeChartsService, useValue: sizeChartsService }],
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
  });

  afterEach(async () => {
    await app.close();
  });

  it('normalizes and creates a chart through the HTTP API', async () => {
    sizeChartsService.create.mockResolvedValue(chart);

    await request(app.getHttpServer())
      .post('/masters/size-charts')
      .send({
        name: '  Size   áo nam ',
        sizes: [' XS ', ' ', ' S', 'M ', ' L ', 'XL'],
      })
      .expect(201)
      .expect(chart);

    expect(sizeChartsService.create).toHaveBeenCalledWith({
      name: 'Size áo nam',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
    });
  });

  it('requires authentication before creating a chart', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SizeChartsController],
      providers: [{ provide: SizeChartsService, useValue: sizeChartsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => {
          throw new UnauthorizedException();
        },
      })
      .compile();
    const unauthenticatedApp = moduleRef.createNestApplication();
    unauthenticatedApp.useGlobalFilters(new HttpExceptionFilter());
    await unauthenticatedApp.init();

    await request(unauthenticatedApp.getHttpServer())
      .post('/masters/size-charts')
      .send({ name: 'Size áo nam', sizes: ['S'] })
      .expect(401);

    expect(sizeChartsService.create).not.toHaveBeenCalled();
    await unauthenticatedApp.close();
  });

  it('passes normalized search and status filters to the service', async () => {
    sizeChartsService.findAll.mockResolvedValue([chart]);

    await request(app.getHttpServer())
      .get('/masters/size-charts?search=%20size%20%20%C3%A1o%20&status=active')
      .expect(200)
      .expect([chart]);

    expect(sizeChartsService.findAll).toHaveBeenCalledWith({
      search: 'size áo',
      status: RecordStatus.ACTIVE,
    });
  });

  it('supports the active-only selector contract', async () => {
    sizeChartsService.findAll.mockResolvedValue([chart]);

    await request(app.getHttpServer())
      .get('/masters/size-charts?status=active')
      .expect(200)
      .expect([chart]);

    expect(sizeChartsService.findAll).toHaveBeenCalledWith({
      status: RecordStatus.ACTIVE,
    });
  });

  it('returns chart detail through the HTTP API', async () => {
    sizeChartsService.findOne.mockResolvedValue(chart);

    await request(app.getHttpServer())
      .get(`/masters/size-charts/${id}`)
      .expect(200)
      .expect(chart);
  });

  it.each([
    { name: '', sizes: ['S'] },
    { name: 'Size áo nam', sizes: [] },
    { name: 'Size áo nam', sizes: [' '] },
    { name: 'Size áo nam', sizes: ['X'.repeat(31)] },
    { name: 'Size áo nam', sizes: ['S'], ignored: true },
  ])('rejects invalid create input before the service', async (body) => {
    await request(app.getHttpServer())
      .post('/masters/size-charts')
      .send(body)
      .expect(400);

    expect(sizeChartsService.create).not.toHaveBeenCalled();
  });

  it('returns bad request when normalized sizes are duplicated', async () => {
    sizeChartsService.create.mockRejectedValue(
      new BadRequestException('Size chart cannot contain duplicate sizes'),
    );

    await request(app.getHttpServer())
      .post('/masters/size-charts')
      .send({ name: 'Size áo nam', sizes: ['M', ' m '] })
      .expect(400);
  });

  it('returns conflict when the normalized name already exists', async () => {
    sizeChartsService.create.mockRejectedValue(
      new ConflictException('Size chart name already exists'),
    );

    await request(app.getHttpServer())
      .post('/masters/size-charts')
      .send({ name: 'Size áo nam', sizes: ['S'] })
      .expect(409);
  });

  it('replaces the ordered list through a partial update', async () => {
    const updated = { ...chart, sizes: ['S', 'M', 'L'] };
    sizeChartsService.update.mockResolvedValue(updated);

    await request(app.getHttpServer())
      .patch(`/masters/size-charts/${id}`)
      .send({ sizes: [' S ', 'M', ' L '] })
      .expect(200)
      .expect(updated);

    expect(sizeChartsService.update).toHaveBeenCalledWith(id, {
      sizes: ['S', 'M', 'L'],
    });
  });

  it.each([
    { sizes: [] },
    { sizes: [' '] },
    { status: RecordStatus.INACTIVE },
    { name: null },
  ])('rejects invalid generic update input', async (body) => {
    await request(app.getHttpServer())
      .patch(`/masters/size-charts/${id}`)
      .send(body)
      .expect(400);

    expect(sizeChartsService.update).not.toHaveBeenCalled();
  });

  it('changes status through the dedicated endpoint', async () => {
    sizeChartsService.updateStatus.mockResolvedValue({
      ...chart,
      status: RecordStatus.INACTIVE,
    });

    await request(app.getHttpServer())
      .patch(`/masters/size-charts/${id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);

    expect(sizeChartsService.updateStatus).toHaveBeenCalledWith(id, {
      status: RecordStatus.INACTIVE,
    });
  });

  it('returns not found for an unknown chart', async () => {
    sizeChartsService.findOne.mockRejectedValue(
      new NotFoundException('Size chart not found'),
    );

    await request(app.getHttpServer())
      .get(`/masters/size-charts/${id}`)
      .expect(404);
  });

  it('does not expose a hard-delete endpoint', async () => {
    await request(app.getHttpServer())
      .delete(`/masters/size-charts/${id}`)
      .expect(404);
  });
});
