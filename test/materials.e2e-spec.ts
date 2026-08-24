import {
  ConflictException,
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
import { MaterialsController } from '../src/features/master-data/materials/materials.controller';
import { MaterialsService } from '../src/features/master-data/materials/materials.service';

describe('Materials API (e2e)', () => {
  const id = '9fb4d58f-0e6d-4ed5-b122-2b9f61aae115';
  const materialGroupId = '852dfb3c-f137-4e05-9751-988f738d70ea';
  const defaultUnitId = '6204e896-b060-45de-a6e7-720e4baf9170';
  const material = {
    id,
    materialCode: 'FAB-001',
    materialName: 'Main fabric',
    materialGroupId,
    materialGroupName: 'Fabric',
    defaultUnitId,
    defaultUnitName: 'Meter',
    defaultYieldPct: '2.5000',
    status: RecordStatus.ACTIVE,
  };
  const materialsService = {
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
      controllers: [MaterialsController],
      providers: [{ provide: MaterialsService, useValue: materialsService }],
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

  it('normalizes the code and trims the name when creating a material', async () => {
    materialsService.create.mockResolvedValue(material);

    await request(app.getHttpServer())
      .post('/masters/materials')
      .send({
        materialCode: ' fab-001 ',
        materialName: ' Main fabric ',
        materialGroupId,
        defaultUnitId,
        defaultYieldPct: '2.5000',
      })
      .expect(201)
      .expect(material);

    expect(materialsService.create).toHaveBeenCalledWith({
      materialCode: 'FAB-001',
      materialName: 'Main fabric',
      materialGroupId,
      defaultUnitId,
      defaultYieldPct: '2.5000',
    });
  });

  it('requires authentication before creating a material', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [{ provide: MaterialsService, useValue: materialsService }],
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
      .post('/masters/materials')
      .send({
        materialCode: 'FAB-001',
        materialName: 'Main fabric',
        defaultUnitId,
      })
      .expect(401);

    expect(materialsService.create).not.toHaveBeenCalled();
    await unauthenticatedApp.close();
  });

  it('passes server-side search and filters to the service', async () => {
    materialsService.findAll.mockResolvedValue([material]);

    await request(app.getHttpServer())
      .get(
        `/masters/materials?search=%20fab%20&materialGroupId=${materialGroupId}&status=active`,
      )
      .expect(200)
      .expect([material]);

    expect(materialsService.findAll).toHaveBeenCalledWith({
      search: 'fab',
      materialGroupId,
      status: RecordStatus.ACTIVE,
    });
  });

  it.each([
    { materialCode: undefined },
    { defaultYieldPct: '1.12345' },
    { ignored: true },
  ])(
    'rejects invalid create input before it reaches the service',
    async (invalid) => {
      await request(app.getHttpServer())
        .post('/masters/materials')
        .send({
          materialCode: 'FAB-001',
          materialName: 'Main fabric',
          defaultUnitId,
          ...invalid,
        })
        .expect(400);

      expect(materialsService.create).not.toHaveBeenCalled();
    },
  );

  it('keeps the material code immutable on update', async () => {
    await request(app.getHttpServer())
      .patch(`/masters/materials/${id}`)
      .send({ materialCode: 'FAB-002' })
      .expect(400);

    expect(materialsService.update).not.toHaveBeenCalled();
  });

  it('allows clearing the optional material group', async () => {
    materialsService.update.mockResolvedValue({
      ...material,
      materialGroupId: null,
      materialGroupName: null,
    });

    await request(app.getHttpServer())
      .patch(`/masters/materials/${id}`)
      .send({ materialGroupId: null })
      .expect(200);

    expect(materialsService.update).toHaveBeenCalledWith(id, {
      materialGroupId: null,
    });
  });

  it('changes status through its dedicated endpoint', async () => {
    materialsService.updateStatus.mockResolvedValue({
      ...material,
      status: RecordStatus.INACTIVE,
    });

    await request(app.getHttpServer())
      .patch(`/masters/materials/${id}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);

    expect(materialsService.updateStatus).toHaveBeenCalledWith(id, {
      status: RecordStatus.INACTIVE,
    });
  });

  it('returns conflict when business data prevents hard deletion', async () => {
    materialsService.remove.mockRejectedValue(
      new ConflictException(
        'Material cannot be deleted because business data references it',
      ),
    );

    await request(app.getHttpServer())
      .delete(`/masters/materials/${id}`)
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'CONFLICT',
          statusCode: 409,
        });
      });
  });
});
