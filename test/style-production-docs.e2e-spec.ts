import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { StyleProductionDocsService } from '../src/features/production/style-production-docs.service';
import { ProductionDocStatus } from '../src/common/enums/database.enums';

describe('Style Production Docs API (e2e)', () => {
  let app: INestApplication;

  const mockStyleId = '123e4567-e89b-12d3-a456-426614174000';
  const mockDocId = '223e4567-e89b-12d3-a456-426614174000';

  const mockDocResponse = {
    id: mockDocId,
    styleId: mockStyleId,
    name: 'Tài liệu sản xuất E2E',
    description: 'Chi tiết E2E',
    status: ProductionDocStatus.DRAFT,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [],
    sizeRows: [],
    attachments: [],
  };

  const mockService = {
    findByStyleId: jest.fn().mockResolvedValue(mockDocResponse),
    findOne: jest.fn().mockResolvedValue(mockDocResponse),
    createWithAutoFill: jest.fn().mockImplementation((styleId, dto) =>
      Promise.resolve({
        id: mockDocId,
        styleId,
        ...dto,
        status: ProductionDocStatus.DRAFT,
      }),
    ),
    update: jest
      .fn()
      .mockImplementation((docId, dto) =>
        Promise.resolve({ ...mockDocResponse, ...dto }),
      ),
    updateStatus: jest
      .fn()
      .mockImplementation((docId, status) =>
        Promise.resolve({ ...mockDocResponse, status }),
      ),
    linkAttachment: jest.fn().mockResolvedValue(undefined),
    unlinkAttachment: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StyleProductionDocsService)
      .useValue(mockService)
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

  it('GET /styles/:styleId/production-docs should return production doc', async () => {
    const res = await request(app.getHttpServer())
      .get(`/styles/${mockStyleId}/production-docs`)
      .expect(200);
    expect(res.body.name).toBe('Tài liệu sản xuất E2E');
  });

  it('POST /styles/:styleId/production-docs should create a new production doc', async () => {
    const res = await request(app.getHttpServer())
      .post(`/styles/${mockStyleId}/production-docs`)
      .send({ name: 'Tài liệu E2E Mới' })
      .expect(201);
    expect(res.body.name).toBe('Tài liệu E2E Mới');
  });

  it('PATCH /styles/:styleId/production-docs/:docId/status should update status to COMPLETED', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/styles/${mockStyleId}/production-docs/${mockDocId}/status`)
      .send({ status: ProductionDocStatus.COMPLETED })
      .expect(200);
    expect(res.body.status).toBe(ProductionDocStatus.COMPLETED);
  });

  it('DELETE /styles/:styleId/production-docs/:docId/attachments/:documentId should unlink attachment without deleting original file', async () => {
    const docFileId = '323e4567-e89b-12d3-a456-426614174000';
    await request(app.getHttpServer())
      .delete(
        `/styles/${mockStyleId}/production-docs/${mockDocId}/attachments/${docFileId}`,
      )
      .expect(204);
  });
});
