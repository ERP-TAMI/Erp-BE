import { Test, TestingModule } from '@nestjs/testing';
import { StyleSampleRoundsController } from './style-sample-rounds.controller';
import { StyleSampleRoundsService } from './style-sample-rounds.service';

describe('StyleSampleRoundsController', () => {
  let controller: StyleSampleRoundsController;
  let service: jest.Mocked<StyleSampleRoundsService>;

  const STYLE_ID = '8f3a1c2e-4b6a-4e1a-9c2d-1a2b3c4d5e6f';
  const ROUND_ID = 'a1b2c3d4-4b6a-4e1a-9c2d-1a2b3c4d5e6f';
  const IMAGE_ID = 'c9d0e1f2-4b6a-4e1a-9c2d-1a2b3c4d5e6f';

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: ROUND_ID }),
      update: jest.fn().mockResolvedValue({ id: ROUND_ID }),
      presignImage: jest.fn().mockResolvedValue({
        objectKey: 'k',
        uploadUrl: 'https://s3.example/put',
        expiresIn: 300,
      }),
      confirmImage: jest.fn().mockResolvedValue({ id: IMAGE_ID }),
      removeImage: jest.fn().mockResolvedValue(undefined),
      getImageDownloadUrl: jest.fn().mockResolvedValue({
        url: 'https://s3.example/get?disposition=attachment',
        expiresIn: 3600,
      }),
    } as unknown as jest.Mocked<StyleSampleRoundsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StyleSampleRoundsController],
      providers: [{ provide: StyleSampleRoundsService, useValue: service }],
    }).compile();

    controller = module.get<StyleSampleRoundsController>(
      StyleSampleRoundsController,
    );
  });

  it('lists rounds for the given style', async () => {
    await controller.list(STYLE_ID);
    expect(service.list).toHaveBeenCalledWith(STYLE_ID);
  });

  it('resolves the caller id from req.user.id and forwards it to create', async () => {
    const dto = { feedback: 'ok' };
    await controller.create(STYLE_ID, dto as any, { user: { id: 'user-1' } });
    expect(service.create).toHaveBeenCalledWith(STYLE_ID, dto, 'user-1');
  });

  it('falls back to req.user.sub when id is absent on create', async () => {
    const dto = { feedback: 'ok' };
    await controller.create(STYLE_ID, dto as any, { user: { sub: 'user-2' } });
    expect(service.create).toHaveBeenCalledWith(STYLE_ID, dto, 'user-2');
  });

  it('delegates update to the service with styleId, roundId and userId', async () => {
    const dto = { status: 'approved' };
    await controller.update(STYLE_ID, ROUND_ID, dto as any, {
      user: { id: 'user-1' },
    });
    expect(service.update).toHaveBeenCalledWith(
      STYLE_ID,
      ROUND_ID,
      dto,
      'user-1',
    );
  });

  it('delegates presignImage to the service', async () => {
    const dto = { fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1024 };
    await controller.presignImage(STYLE_ID, ROUND_ID, dto as any);
    expect(service.presignImage).toHaveBeenCalledWith(STYLE_ID, ROUND_ID, dto);
  });

  it('resolves the caller id and forwards it to confirmImage', async () => {
    const dto = {
      objectKey: 'k',
      fileName: 'a.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
    };
    await controller.confirmImage(STYLE_ID, ROUND_ID, dto as any, {
      user: { id: 'user-1' },
    });
    expect(service.confirmImage).toHaveBeenCalledWith(
      STYLE_ID,
      ROUND_ID,
      'user-1',
      dto,
    );
  });

  it('delegates removeImage to the service', async () => {
    await controller.removeImage(STYLE_ID, ROUND_ID, IMAGE_ID);
    expect(service.removeImage).toHaveBeenCalledWith(
      STYLE_ID,
      ROUND_ID,
      IMAGE_ID,
    );
  });

  it('delegates getImageDownloadUrl to the service', async () => {
    const result = await controller.getImageDownloadUrl(
      STYLE_ID,
      ROUND_ID,
      IMAGE_ID,
    );
    expect(service.getImageDownloadUrl).toHaveBeenCalledWith(
      STYLE_ID,
      ROUND_ID,
      IMAGE_ID,
    );
    expect(result).toEqual({
      url: 'https://s3.example/get?disposition=attachment',
      expiresIn: 3600,
    });
  });
});
