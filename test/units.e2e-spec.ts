import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { UnitsController } from '../src/modules/master-data/units/controllers/units.controller';
import { UnitsService } from '../src/modules/master-data/units/services/units.service';

describe('Units API (e2e)', () => {
  const unitsService = { findAll: jest.fn() };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [UnitsController],
      providers: [{ provide: UnitsService, useValue: unitsService }],
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

  it('lists active units for the material form', async () => {
    const units = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        code: 'PCS',
        name: 'Cái',
        status: RecordStatus.ACTIVE,
      },
    ];
    unitsService.findAll.mockResolvedValue(units);

    await request(app.getHttpServer())
      .get('/masters/units?status=active')
      .expect(200)
      .expect(units);

    expect(unitsService.findAll).toHaveBeenCalledWith({
      status: RecordStatus.ACTIVE,
    });
  });

  it('rejects an unsupported status', async () => {
    await request(app.getHttpServer())
      .get('/masters/units?status=deleted')
      .expect(400);
    expect(unitsService.findAll).not.toHaveBeenCalled();
  });
});
