import {
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
import { WorkshopsController } from '../src/features/master-data/workshops/workshops.controller';
import { WorkshopsService } from '../src/features/master-data/workshops/workshops.service';

describe('Workshops API (e2e)', () => {
  const id = 'f4ab3c98-2941-42e9-a92a-1e90f6087fd0';
  const workshop = {
    id,
    workshopCode: 'X-01',
    name: 'Xưởng May 1',
    manager: 'Nguyễn Văn A',
    location: 'Khu A',
    capacity: 500,
    status: RecordStatus.ACTIVE,
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
  };
  const workshopsService = {
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
      controllers: [WorkshopsController],
      providers: [{ provide: WorkshopsService, useValue: workshopsService }],
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

  it('normalizes and creates a workshop through the HTTP API', async () => {
    workshopsService.create.mockResolvedValue(workshop);

    await request(app.getHttpServer())
      .post('/masters/workshops')
      .send({
        workshopCode: ' x-01 ',
        name: ' Xưởng May 1 ',
        manager: ' Nguyễn Văn A ',
        location: ' Khu A ',
        capacity: 500,
      })
      .expect(201)
      .expect(workshop);

    expect(workshopsService.create).toHaveBeenCalledWith({
      workshopCode: 'X-01',
      name: 'Xưởng May 1',
      manager: 'Nguyễn Văn A',
      location: 'Khu A',
      capacity: 500,
    });
  });

  it('requires authentication before creating a workshop', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WorkshopsController],
      providers: [{ provide: WorkshopsService, useValue: workshopsService }],
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
      .post('/masters/workshops')
      .send({ workshopCode: 'X-01', name: 'Xưởng May 1' })
      .expect(401);

    expect(workshopsService.create).not.toHaveBeenCalled();
    await unauthenticatedApp.close();
  });

  it('passes normalized search and status filters to the service', async () => {
    workshopsService.findAll.mockResolvedValue([workshop]);

    await request(app.getHttpServer())
      .get('/masters/workshops?search=%20may%20&status=active')
      .expect(200)
      .expect([workshop]);

    expect(workshopsService.findAll).toHaveBeenCalledWith({
      search: 'may',
      status: RecordStatus.ACTIVE,
    });
  });

  it('supports the active-only production-plan selector contract', async () => {
    workshopsService.findAll.mockResolvedValue([workshop]);

    await request(app.getHttpServer())
      .get('/masters/workshops?status=active')
      .expect(200)
      .expect([workshop]);

    expect(workshopsService.findAll).toHaveBeenCalledWith({
      status: RecordStatus.ACTIVE,
    });
  });

  it('returns workshop detail through the HTTP API', async () => {
    workshopsService.findOne.mockResolvedValue(workshop);

    await request(app.getHttpServer())
      .get(`/masters/workshops/${id}`)
      .expect(200)
      .expect(workshop);
  });

  it.each([
    { workshopCode: '', name: 'Xưởng May 1' },
    { workshopCode: 'X-01', name: '   ' },
    { workshopCode: 'X-01', name: 'Xưởng May 1', capacity: -1 },
    { workshopCode: 'X-01', name: 'Xưởng May 1', capacity: 1.5 },
    { workshopCode: 'X-01', name: 'Xưởng May 1', capacity: 2147483648 },
    { workshopCode: 'X-01', name: 'Xưởng May 1', ignored: true },
  ])('rejects invalid create input before the service', async (body) => {
    await request(app.getHttpServer())
      .post('/masters/workshops')
      .send(body)
      .expect(400);

    expect(workshopsService.create).not.toHaveBeenCalled();
  });

  it('updates mutable workshop fields', async () => {
    const updated = { ...workshop, name: 'Xưởng May Chính', capacity: 700 };
    workshopsService.update.mockResolvedValue(updated);

    await request(app.getHttpServer())
      .patch(`/masters/workshops/${id}`)
      .send({ name: ' Xưởng May Chính ', capacity: 700 })
      .expect(200)
      .expect(updated);

    expect(workshopsService.update).toHaveBeenCalledWith(id, {
      name: 'Xưởng May Chính',
      capacity: 700,
    });
  });

  it('normalizes and updates the workshop code through the HTTP API', async () => {
    const updated = { ...workshop, workshopCode: 'X-02' };
    workshopsService.update.mockResolvedValue(updated);

    await request(app.getHttpServer())
      .patch(`/masters/workshops/${id}`)
      .send({ workshopCode: ' x-02 ' })
      .expect(200)
      .expect(updated);

    expect(workshopsService.update).toHaveBeenCalledWith(id, {
      workshopCode: 'X-02',
    });
  });

  it.each([{ workshopCode: '   ' }, { status: RecordStatus.INACTIVE }])(
    'rejects invalid generic update fields',
    async (body) => {
      await request(app.getHttpServer())
        .patch(`/masters/workshops/${id}`)
        .send(body)
        .expect(400);

      expect(workshopsService.update).not.toHaveBeenCalled();
    },
  );

  it('returns conflict when the normalized workshop code already exists', async () => {
    workshopsService.create.mockRejectedValue(
      new ConflictException('Workshop code already exists'),
    );

    await request(app.getHttpServer())
      .post('/masters/workshops')
      .send({ workshopCode: 'X-01', name: 'Xưởng May 1' })
      .expect(409);
  });

  it('returns not found when workshop detail does not exist', async () => {
    workshopsService.findOne.mockRejectedValue(
      new NotFoundException('Workshop not found'),
    );

    await request(app.getHttpServer())
      .get(`/masters/workshops/${id}`)
      .expect(404);
  });

  it('changes status through the dedicated endpoint', async () => {
    workshopsService.updateStatus.mockResolvedValue({
      ...workshop,
      status: RecordStatus.INACTIVE,
    });

    await request(app.getHttpServer())
      .patch(`/masters/workshops/${id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);

    expect(workshopsService.updateStatus).toHaveBeenCalledWith(id, {
      status: RecordStatus.INACTIVE,
    });
  });

  it('deletes an unreferenced workshop', async () => {
    workshopsService.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete(`/masters/workshops/${id}`)
      .expect(204);

    expect(workshopsService.remove).toHaveBeenCalledWith(id);
  });

  it('returns conflict when deleting a workshop referenced by business data', async () => {
    workshopsService.remove.mockRejectedValue(
      new ConflictException(
        'Workshop cannot be deleted because it is referenced by business data',
      ),
    );

    await request(app.getHttpServer())
      .delete(`/masters/workshops/${id}`)
      .expect(409);
  });

  it('returns not found when deleting a non-existent workshop', async () => {
    workshopsService.remove.mockRejectedValue(
      new NotFoundException('Workshop not found'),
    );

    await request(app.getHttpServer())
      .delete(`/masters/workshops/${id}`)
      .expect(404);
  });
});
