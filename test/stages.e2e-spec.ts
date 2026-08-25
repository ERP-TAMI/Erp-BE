import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { StagesController } from '../src/features/master-data/stages/stages.controller';
import { StagesService } from '../src/features/master-data/stages/stages.service';

describe('Stages API (e2e)', () => {
  const id = '64bfc097-69d1-43f5-af97-cb0e7428f7df';
  const secondId = '771c0dc2-cd59-44e3-9b16-cacb200f20e5';
  const stage = {
    id,
    stageCode: 'GD-CAT',
    stageName: 'Cắt vải',
    description: 'Cắt chi tiết theo sơ đồ',
    ssv: '12.500',
    status: RecordStatus.ACTIVE,
  };
  const stagesService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    updateSsvBulk: jest.fn(),
    remove: jest.fn(),
  };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [StagesController],
      providers: [{ provide: StagesService, useValue: stagesService }],
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

  it('normalizes and creates a stage through the HTTP API', async () => {
    stagesService.create.mockResolvedValue(stage);

    await request(app.getHttpServer())
      .post('/masters/stages')
      .send({
        stageCode: ' gd-cat ',
        stageName: ' Cắt vải ',
        description: ' Cắt chi tiết theo sơ đồ ',
        ssv: '12.500',
      })
      .expect(201)
      .expect(stage);

    expect(stagesService.create).toHaveBeenCalledWith({
      stageCode: 'GD-CAT',
      stageName: 'Cắt vải',
      description: 'Cắt chi tiết theo sơ đồ',
      ssv: '12.500',
    });
  });

  it('allows the stage code to be omitted for server-side generation', async () => {
    stagesService.create.mockResolvedValue({
      ...stage,
      stageCode: 'GD-UI-TP-PHA-HOI',
      stageName: 'Ủi TP + phà hơi',
    });

    await request(app.getHttpServer())
      .post('/masters/stages')
      .send({ stageCode: '   ', stageName: ' Ủi TP + phà hơi ' })
      .expect(201);

    expect(stagesService.create).toHaveBeenCalledWith({
      stageName: 'Ủi TP + phà hơi',
    });
  });

  it('requires authentication before creating a stage', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StagesController],
      providers: [{ provide: StagesService, useValue: stagesService }],
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
      .post('/masters/stages')
      .send({ stageCode: 'GD-CAT', stageName: 'Cắt vải' })
      .expect(401);

    expect(stagesService.create).not.toHaveBeenCalled();
    await unauthenticatedApp.close();
  });

  it('passes trimmed search and status filters to the service', async () => {
    stagesService.findAll.mockResolvedValue([stage]);

    await request(app.getHttpServer())
      .get('/masters/stages?search=%20c%E1%BA%AFt%20&status=active')
      .expect(200)
      .expect([stage]);

    expect(stagesService.findAll).toHaveBeenCalledWith({
      search: 'cắt',
      status: RecordStatus.ACTIVE,
    });
  });

  it('returns a stage detail through the HTTP API', async () => {
    stagesService.findOne.mockResolvedValue(stage);

    await request(app.getHttpServer())
      .get(`/masters/stages/${id}`)
      .expect(200)
      .expect(stage);

    expect(stagesService.findOne).toHaveBeenCalledWith(id);
  });

  it.each([{ ssv: '-1' }, { ssv: '1.1234' }, { ssv: 12.5 }, { ignored: true }])(
    'rejects invalid create input before the service',
    async (invalid) => {
      await request(app.getHttpServer())
        .post('/masters/stages')
        .send({ stageCode: 'GD-CAT', stageName: 'Cắt vải', ...invalid })
        .expect(400);

      expect(stagesService.create).not.toHaveBeenCalled();
    },
  );

  it('normalizes and updates the stage code through the HTTP API', async () => {
    const updatedStage = { ...stage, stageCode: 'GD-MAY' };
    stagesService.update.mockResolvedValue(updatedStage);

    await request(app.getHttpServer())
      .patch(`/masters/stages/${id}`)
      .send({ stageCode: ' gd-may ' })
      .expect(200)
      .expect(updatedStage);

    expect(stagesService.update).toHaveBeenCalledWith(id, {
      stageCode: 'GD-MAY',
    });
  });

  it('rejects an empty stage code on update', async () => {
    await request(app.getHttpServer())
      .patch(`/masters/stages/${id}`)
      .send({ stageCode: '   ' })
      .expect(400);

    expect(stagesService.update).not.toHaveBeenCalled();
  });

  it('normalizes and updates mutable stage fields through the HTTP API', async () => {
    const updatedStage = {
      ...stage,
      stageName: 'Cắt laser',
      description: 'Cắt bằng máy laser',
      ssv: '15.250',
    };
    stagesService.update.mockResolvedValue(updatedStage);

    await request(app.getHttpServer())
      .patch(`/masters/stages/${id}`)
      .send({
        stageName: ' Cắt laser ',
        description: ' Cắt bằng máy laser ',
        ssv: '15.250',
      })
      .expect(200)
      .expect(updatedStage);

    expect(stagesService.update).toHaveBeenCalledWith(id, {
      stageName: 'Cắt laser',
      description: 'Cắt bằng máy laser',
      ssv: '15.250',
    });
  });

  it('changes status through the dedicated endpoint', async () => {
    stagesService.updateStatus.mockResolvedValue({
      ...stage,
      status: RecordStatus.INACTIVE,
    });

    await request(app.getHttpServer())
      .patch(`/masters/stages/${id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);

    expect(stagesService.updateStatus).toHaveBeenCalledWith(id, {
      status: RecordStatus.INACTIVE,
    });
  });

  it('deletes a stage through the HTTP API', async () => {
    stagesService.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete(`/masters/stages/${id}`)
      .expect(204);

    expect(stagesService.remove).toHaveBeenCalledWith(id);
  });

  it('updates SSV in bulk through the static route', async () => {
    const items = [
      { id, ssv: '13.000' },
      { id: secondId, ssv: '8.250' },
    ];
    stagesService.updateSsvBulk.mockResolvedValue([
      { ...stage, ssv: '13.000' },
      { ...stage, id: secondId, stageCode: 'GD-MAY', ssv: '8.250' },
    ]);

    await request(app.getHttpServer())
      .patch('/masters/stages/bulk-ssv')
      .send({ items })
      .expect(200);

    expect(stagesService.updateSsvBulk).toHaveBeenCalledWith({ items });
  });

  it('accepts bulk SSV updates larger than 200 changed rows', async () => {
    const items = Array.from({ length: 201 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      ssv: '1.000',
    }));
    stagesService.updateSsvBulk.mockResolvedValue([]);

    await request(app.getHttpServer())
      .patch('/masters/stages/bulk-ssv')
      .send({ items })
      .expect(200)
      .expect([]);

    expect(stagesService.updateSsvBulk).toHaveBeenCalledWith({ items });
  });

  it.each([
    { items: [] },
    { items: [{ id, ssv: '-1' }] },
    { items: [{ id, ssv: '1.1234' }] },
    {
      items: [
        { id, ssv: '1' },
        { id, ssv: '2' },
      ],
    },
  ])('rejects invalid bulk input before the service', async (body) => {
    await request(app.getHttpServer())
      .patch('/masters/stages/bulk-ssv')
      .send(body)
      .expect(400);

    expect(stagesService.updateSsvBulk).not.toHaveBeenCalled();
  });
});
