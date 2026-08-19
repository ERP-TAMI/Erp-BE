import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const databaseE2e =
  process.env.RUN_DATABASE_E2E === 'true' ? describe : describe.skip;

databaseE2e('Units database API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
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
  }, 30000);

  afterAll(async () => app.close());

  it('returns the default active units used by the material form', async () => {
    const response = await request(app.getHttpServer())
      .get('/masters/units?status=active')
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PCS', name: 'Cái', status: 'active' }),
        expect.objectContaining({ code: 'M', name: 'Mét', status: 'active' }),
        expect.objectContaining({
          code: 'KG',
          name: 'Kilôgam',
          status: 'active',
        }),
        expect.objectContaining({
          code: 'ROLL',
          name: 'Cuộn',
          status: 'active',
        }),
        expect.objectContaining({ code: 'L', name: 'Lít', status: 'active' }),
      ]),
    );
  });
});
