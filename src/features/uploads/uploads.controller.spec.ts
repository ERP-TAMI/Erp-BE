import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

describe('UploadsController', () => {
  let controller: UploadsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
    }).compile();

    controller = module.get<UploadsController>(UploadsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should throw BadRequestException if no file is provided', async () => {
    await expect(controller.uploadFile(undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should return file metadata and local URL if valid image file is provided', async () => {
    const mockFile: any = {
      fieldname: 'file',
      originalname: 'sample.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024,
      destination: '/uploads',
      filename: 'img-123456789.jpg',
      path: '/uploads/img-123456789.jpg',
      buffer: Buffer.from('mock image content'),
      stream: null as any,
    };

    const result = await controller.uploadFile(mockFile);

    expect(result).toMatchObject({
      url: expect.stringContaining('/uploads/'),
      filename: expect.any(String),
      originalname: 'sample.jpg',
      size: 1024,
    });
  });
});
