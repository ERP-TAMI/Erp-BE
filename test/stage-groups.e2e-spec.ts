import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { RecordStatus } from '../src/common/enums/database.enums';
import { StageGroupsController } from '../src/features/master-data/stage-groups/stage-groups.controller';
import { StageGroupsService } from '../src/features/master-data/stage-groups/stage-groups.service';

describe('Stage groups controller boundary (e2e)', () => {
  const id = '64bfc097-69d1-43f5-af97-cb0e7428f7df';
  const stageId = '771c0dc2-cd59-44e3-9b16-cacb200f20e5';
  const group = {
    id,
    groupCode: 'NC-MAY',
    groupName: 'Nhóm may',
    description: null,
    status: RecordStatus.ACTIVE,
    itemCount: 1,
    createdAt: '2026-08-24T01:00:00.000Z',
    updatedAt: '2026-08-24T01:00:00.000Z',
    items: [
      {
        stageId,
        stageCode: 'GD-MAY',
        stageName: 'May thân',
        description: null,
        ssv: '12.500',
        orderIndex: 0,
      },
    ],
  };
  const stageGroupsService = {
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
      controllers: [StageGroupsController],
      providers: [
        { provide: StageGroupsService, useValue: stageGroupsService },
      ],
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

  it('normalizes and creates a stage group through the HTTP API', async () => {
    stageGroupsService.create.mockResolvedValue(group);

    await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: ' nc-may ',
        groupName: ' Nhóm may ',
        description: ' ',
        items: [{ stageId, orderIndex: 0 }],
      })
      .expect(201)
      .expect(group);

    expect(stageGroupsService.create).toHaveBeenCalledWith({
      groupCode: 'NC-MAY',
      groupName: 'Nhóm may',
      description: null,
      items: [{ stageId, orderIndex: 0 }],
    });
  });

  it('accepts a validated group-specific SSV for each selected Stage', async () => {
    stageGroupsService.create.mockResolvedValue({
      ...group,
      items: [{ ...group.items[0], ssv: '15.250' }],
    });

    await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupName: 'Nhóm may',
        items: [{ stageId, orderIndex: 0, ssv: ' 15.250 ' }],
      })
      .expect(201);

    expect(stageGroupsService.create).toHaveBeenCalledWith({
      groupName: 'Nhóm may',
      items: [{ stageId, orderIndex: 0, ssv: '15.250' }],
    });
  });

  it('allows the service to generate a group code when the field is blank', async () => {
    stageGroupsService.create.mockResolvedValue({
      ...group,
      groupCode: 'NS-NHOM-MAY',
    });

    await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({
        groupCode: '   ',
        groupName: ' Nhóm may ',
        items: [{ stageId, orderIndex: 0 }],
      })
      .expect(201);

    expect(stageGroupsService.create).toHaveBeenCalledWith({
      groupName: 'Nhóm may',
      items: [{ stageId, orderIndex: 0 }],
    });
  });

  it('passes search and status filters to the service', async () => {
    stageGroupsService.findAll.mockResolvedValue([group]);

    await request(app.getHttpServer())
      .get('/masters/stage-groups?search=%20may%20&status=active')
      .expect(200);

    expect(stageGroupsService.findAll).toHaveBeenCalledWith({
      search: 'may',
      status: RecordStatus.ACTIVE,
    });
  });

  it.each([
    { items: [] },
    {
      items: [
        { stageId, orderIndex: 0 },
        { stageId, orderIndex: 1 },
      ],
    },
    { items: [{ stageId: 'not-a-uuid', orderIndex: 0 }] },
    { items: [{ stageId, orderIndex: -1 }] },
    { items: [{ stageId, orderIndex: 0, ssv: -1 }] },
    { items: [{ stageId, orderIndex: 0, ssv: '-1.000' }] },
    { items: [{ stageId, orderIndex: 0, ssv: '1.0000' }] },
    { items: [{ stageId, orderIndex: 0, ssv: '1000000000.000' }] },
  ])('rejects invalid item input before the service', async (invalid) => {
    await request(app.getHttpServer())
      .post('/masters/stage-groups')
      .send({ groupCode: 'NC-MAY', groupName: 'Nhóm may', ...invalid })
      .expect(400);

    expect(stageGroupsService.create).not.toHaveBeenCalled();
  });

  it('keeps the group code immutable on update', async () => {
    await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${id}`)
      .send({ groupCode: 'NC-CAT' })
      .expect(400);

    expect(stageGroupsService.update).not.toHaveBeenCalled();
  });

  it.each([{ groupName: null }, { items: null }])(
    'rejects null update fields before the service: %p',
    async (invalid) => {
      await request(app.getHttpServer())
        .patch(`/masters/stage-groups/${id}`)
        .send(invalid)
        .expect(400);

      expect(stageGroupsService.update).not.toHaveBeenCalled();
    },
  );

  it('allows null description to clear the optional value', async () => {
    stageGroupsService.update.mockResolvedValue(group);

    await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${id}`)
      .send({ description: null })
      .expect(200);

    expect(stageGroupsService.update).toHaveBeenCalledWith(id, {
      description: null,
    });
  });

  it('replaces the ordered stage list through update', async () => {
    stageGroupsService.update.mockResolvedValue(group);

    await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${id}`)
      .send({
        groupName: ' Nhóm may ',
        items: [{ stageId, orderIndex: 0 }],
      })
      .expect(200)
      .expect(group);

    expect(stageGroupsService.update).toHaveBeenCalledWith(id, {
      groupName: 'Nhóm may',
      items: [{ stageId, orderIndex: 0 }],
    });
  });

  it('changes status through the dedicated endpoint', async () => {
    stageGroupsService.updateStatus.mockResolvedValue({
      ...group,
      status: RecordStatus.INACTIVE,
    });

    await request(app.getHttpServer())
      .patch(`/masters/stage-groups/${id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);

    expect(stageGroupsService.updateStatus).toHaveBeenCalledWith(id, {
      status: RecordStatus.INACTIVE,
    });
  });

  it('deletes a stage group through the dedicated endpoint', async () => {
    stageGroupsService.remove.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .delete(`/masters/stage-groups/${id}`)
      .expect(204);

    expect(stageGroupsService.remove).toHaveBeenCalledWith(id);
  });
});
