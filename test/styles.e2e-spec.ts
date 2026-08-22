import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { StylesService } from '../src/features/styles/styles.service';
import { StyleStatus } from '../src/common/enums/database.enums';

describe('Styles API (e2e)', () => {
  let app: INestApplication;

  const mockStyle = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    styleCode: 'FIT-2026-E2E',
    styleName: 'Áo Khoác E2E',
    status: StyleStatus.DRAFT,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockStylesService = {
    create: jest.fn().mockImplementation((dto) => Promise.resolve({ id: mockStyle.id, ...dto, status: dto.status || StyleStatus.DRAFT })),
    findAll: jest.fn().mockResolvedValue({
      data: [mockStyle],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    }),
    findOne: jest.fn().mockImplementation((id) =>
      id === mockStyle.id ? Promise.resolve(mockStyle) : Promise.reject({ status: 404, message: 'Not Found' }),
    ),
    update: jest.fn().mockImplementation((id, dto) => Promise.resolve({ ...mockStyle, ...dto })),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StylesService)
      .useValue(mockStylesService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /styles should return list of styles', async () => {
    const res = await request(app.getHttpServer()).get('/styles').expect(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data[0].styleCode).toBe('FIT-2026-E2E');
  });

  it('POST /styles should create a new style', async () => {
    const payload = {
      styleCode: 'FIT-2026-NEW',
      styleName: 'Áo Thun E2E',
    };
    const res = await request(app.getHttpServer())
      .post('/styles')
      .send(payload)
      .expect(201);
    expect(res.body.styleCode).toBe('FIT-2026-NEW');
  });

  it('GET /styles/:id should return single style', async () => {
    const res = await request(app.getHttpServer())
      .get(`/styles/${mockStyle.id}`)
      .expect(200);
    expect(res.body.id).toBe(mockStyle.id);
  });

  it('PATCH /styles/:id should update style', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/styles/${mockStyle.id}`)
      .send({ status: StyleStatus.APPROVED })
      .expect(200);
    expect(res.body.status).toBe(StyleStatus.APPROVED);
  });
});
