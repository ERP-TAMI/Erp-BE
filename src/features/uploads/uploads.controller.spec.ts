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

  it('should throw BadRequestException if image file exceeds 10MB', async () => {
    const mockFile: any = {
      originalname: 'large-image.jpg',
      size: 11 * 1024 * 1024,
      buffer: Buffer.alloc(100),
    };

    await expect(
      controller.uploadFile(mockFile, 'style-images'),
    ).rejects.toThrow('Dung lượng file vượt quá giới hạn tối đa 10MB');
  });

  it('should throw BadRequestException if document exceeds 20MB', async () => {
    const mockFile: any = {
      originalname: 'large-doc.pdf',
      size: 21 * 1024 * 1024,
      buffer: Buffer.alloc(100),
    };

    await expect(
      controller.uploadFile(mockFile, 'documents'),
    ).rejects.toThrow('Dung lượng file vượt quá giới hạn tối đa 20MB');
  });

  it('should throw BadRequestException if file format is executable / prohibited', async () => {
    const mockFile: any = {
      originalname: 'malware.exe',
      size: 1024,
      buffer: Buffer.from('test'),
    };

    await expect(
      controller.uploadFile(mockFile, 'documents'),
    ).rejects.toThrow('không được hỗ trợ vì lý do bảo mật');
  });
});
