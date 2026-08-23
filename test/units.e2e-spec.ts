import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';
import { UnitsController } from '../src/features/master-data/units/units.controller';
import { UnitsService } from '../src/features/master-data/units/units.service';

describe('Units API (e2e)', () => {
  const unit = {
    id: '41fc8e1b-0441-463b-af3f-edf74592084d',
    code: 'M',
    name: 'Mét',
    decimalScale: 4,
    status: RecordStatus.ACTIVE,
  };
  const unitsService = { findAll: jest.fn() };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [UnitsController],
      providers: [{ provide: UnitsService, useValue: unitsService }],
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

  it('lists active units for material selectors', async () => {
    unitsService.findAll.mockResolvedValue([unit]);

    await request(app.getHttpServer())
      .get('/masters/units?status=active')
      .expect(200)
      .expect([unit]);

    expect(unitsService.findAll).toHaveBeenCalledWith({
      status: RecordStatus.ACTIVE,
    });
  });

  it('rejects invalid status before calling the service', async () => {
    await request(app.getHttpServer())
      .get('/masters/units?status=unknown')
      .expect(400);

    expect(unitsService.findAll).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UnitsController],
      providers: [{ provide: UnitsService, useValue: unitsService }],
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
      .get('/masters/units?status=active')
      .expect(401);

    expect(unitsService.findAll).not.toHaveBeenCalled();
    await unauthenticatedApp.close();
  });
});
