import { Test, TestingModule } from '@nestjs/testing';
import { StyleDocumentsController } from './style-documents.controller';
import { StyleDocumentsService } from './style-documents.service';

describe('StyleDocumentsController', () => {
  let controller: StyleDocumentsController;
  let service: jest.Mocked<StyleDocumentsService>;

  const STYLE_ID = '8f3a1c2e-4b6a-4e1a-9c2d-1a2b3c4d5e6f';
  const DOCUMENT_ID = 'c9d0e1f2-4b6a-4e1a-9c2d-1a2b3c4d5e6f';

  beforeEach(async () => {
    service = {
      presign: jest.fn().mockResolvedValue({
        objectKey: 'k',
        uploadUrl: 'https://s3.example/put',
        expiresIn: 300,
      }),
      confirm: jest.fn().mockResolvedValue({ documentId: DOCUMENT_ID }),
      list: jest.fn().mockResolvedValue([]),
      getViewUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://s3.example/get', expiresIn: 3600 }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StyleDocumentsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StyleDocumentsController],
      providers: [{ provide: StyleDocumentsService, useValue: service }],
    }).compile();

    controller = module.get<StyleDocumentsController>(
      StyleDocumentsController,
    );
  });

  it('delegates presign to the service with the styleId param', async () => {
    const dto = {
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    };

    await controller.presign(STYLE_ID, dto);

    expect(service.presign).toHaveBeenCalledWith(STYLE_ID, dto);
  });

  it('resolves the caller id from req.user.id and forwards it to confirm', async () => {
    const dto = {
      objectKey: 'k',
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    };

    await controller.confirm(STYLE_ID, dto, { user: { id: 'user-1' } });

    expect(service.confirm).toHaveBeenCalledWith(STYLE_ID, 'user-1', dto);
  });

  it('falls back to req.user.sub when id is absent', async () => {
    const dto = {
      objectKey: 'k',
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    };

    await controller.confirm(STYLE_ID, dto, { user: { sub: 'user-2' } });

    expect(service.confirm).toHaveBeenCalledWith(STYLE_ID, 'user-2', dto);
  });

  it('lists documents for the given style', async () => {
    await controller.list(STYLE_ID);
    expect(service.list).toHaveBeenCalledWith(STYLE_ID);
  });

  it('parses download=true into a boolean before calling the service', async () => {
    await controller.getViewUrl(STYLE_ID, DOCUMENT_ID, 'true');
    expect(service.getViewUrl).toHaveBeenCalledWith(
      STYLE_ID,
      DOCUMENT_ID,
      true,
    );
  });

  it('treats a missing download query param as false', async () => {
    await controller.getViewUrl(STYLE_ID, DOCUMENT_ID);
    expect(service.getViewUrl).toHaveBeenCalledWith(
      STYLE_ID,
      DOCUMENT_ID,
      false,
    );
  });

  it('delegates remove to the service', async () => {
    await controller.remove(STYLE_ID, DOCUMENT_ID);
    expect(service.remove).toHaveBeenCalledWith(STYLE_ID, DOCUMENT_ID);
  });
});
