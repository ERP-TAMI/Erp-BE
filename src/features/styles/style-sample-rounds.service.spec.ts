import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StyleSampleRoundsService } from './style-sample-rounds.service';
import { Style } from './entities/Style.entity';
import { StyleSampleRound } from './entities/StyleSampleRound.entity';
import { StyleSampleImage } from './entities/StyleSampleImage.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { SampleStatus } from '../../common/enums/database.enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';

function buildQueryBuilderMock(result: unknown) {
  const qb: Record<string, jest.Mock> = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    orderBy: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
  Object.keys(qb).forEach((key) => {
    if (key !== 'getRawMany') qb[key].mockReturnValue(qb);
  });
  return qb;
}

function buildSingleRowQueryBuilderMock(result: unknown) {
  const qb: Record<string, jest.Mock> = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue(result),
  };
  Object.keys(qb).forEach((key) => {
    if (key !== 'getRawOne') qb[key].mockReturnValue(qb);
  });
  return qb;
}

describe('StyleSampleRoundsService', () => {
  let service: StyleSampleRoundsService;
  let styleRepoMock: { exist: jest.Mock };
  let roundRepoMock: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let imageRepoMock: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    remove: jest.Mock;
  };
  let storageMock: jest.Mocked<StorageService>;
  let docRepoMock: { create: jest.Mock; save: jest.Mock };
  let versionRepoMock: { create: jest.Mock; save: jest.Mock };
  let txImageRepoMock: { create: jest.Mock; save: jest.Mock; count: jest.Mock };

  const STYLE_ID = '8f3a1c2e-4b6a-4e1a-9c2d-1a2b3c4d5e6f';
  const ROUND_ID = 'a1b2c3d4-4b6a-4e1a-9c2d-1a2b3c4d5e6f';

  beforeEach(async () => {
    styleRepoMock = { exist: jest.fn().mockResolvedValue(true) };
    roundRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: ROUND_ID, ...v })),
    };
    imageRepoMock = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      remove: jest.fn(),
    };
    docRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'doc-1', ...v })),
    };
    versionRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'version-1', ...v })),
    };
    txImageRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'image-1', ...v })),
      count: jest.fn().mockResolvedValue(0),
    };

    storageMock = {
      getPresignedPutUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.example/get'),
      deleteObject: jest.fn(),
      headObject: jest.fn().mockResolvedValue({ exists: true }),
      getObjectHead: jest.fn().mockResolvedValue(Buffer.from('')),
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('')),
    };

    const dataSourceMock = {
      transaction: jest.fn().mockImplementation((cb: any) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === Document) return docRepoMock;
            if (entity === DocumentVersion) return versionRepoMock;
            if (entity === StyleSampleImage) return txImageRepoMock;
            throw new Error(`No mock repository for entity ${entity?.name}`);
          },
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StyleSampleRoundsService,
        { provide: getRepositoryToken(Style), useValue: styleRepoMock },
        {
          provide: getRepositoryToken(StyleSampleRound),
          useValue: roundRepoMock,
        },
        {
          provide: getRepositoryToken(StyleSampleImage),
          useValue: imageRepoMock,
        },
        { provide: STORAGE_SERVICE, useValue: storageMock },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<StyleSampleRoundsService>(StyleSampleRoundsService);
  });

  describe('create', () => {
    it('auto-increments roundNo and defaults status to WORKING', async () => {
      roundRepoMock.count.mockResolvedValueOnce(2);

      const result = await service.create(
        STYLE_ID,
        { feedback: 'Lần 3' },
        'user-1',
      );

      expect(result.roundNo).toBe(3);
      expect(result.status).toBe(SampleStatus.WORKING);
      expect(result.reviewedBy).toBeNull();
      expect(result.reviewedAt).toBeNull();
      expect(result.images).toEqual([]);
    });

    it('stamps reviewedBy/reviewedAt when created directly with a decided status', async () => {
      const result = await service.create(
        STYLE_ID,
        { status: SampleStatus.APPROVED },
        'user-1',
      );

      expect(result.reviewedBy).toBe('user-1');
      expect(result.reviewedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when the style does not exist', async () => {
      styleRepoMock.exist.mockResolvedValue(false);

      await expect(service.create(STYLE_ID, {}, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('stamps reviewedBy/reviewedAt when status moves away from WORKING', async () => {
      roundRepoMock.findOne.mockResolvedValue({
        id: ROUND_ID,
        styleId: STYLE_ID,
        roundNo: 1,
        status: SampleStatus.WORKING,
        reviewedBy: null,
        reviewedAt: null,
      });
      imageRepoMock.createQueryBuilder.mockReturnValue(
        buildQueryBuilderMock([]),
      );

      const result = await service.update(
        STYLE_ID,
        ROUND_ID,
        { status: SampleStatus.NEEDS_REVISION },
        'user-2',
      );

      expect(result.status).toBe(SampleStatus.NEEDS_REVISION);
      expect(result.reviewedBy).toBe('user-2');
      expect(result.reviewedAt).toBeInstanceOf(Date);
    });

    it('clears reviewedBy/reviewedAt when status moves back to WORKING', async () => {
      roundRepoMock.findOne.mockResolvedValue({
        id: ROUND_ID,
        styleId: STYLE_ID,
        roundNo: 1,
        status: SampleStatus.APPROVED,
        reviewedBy: 'user-1',
        reviewedAt: new Date('2026-01-01'),
      });
      imageRepoMock.createQueryBuilder.mockReturnValue(
        buildQueryBuilderMock([]),
      );

      const result = await service.update(
        STYLE_ID,
        ROUND_ID,
        { status: SampleStatus.WORKING },
        'user-2',
      );

      expect(result.reviewedBy).toBeNull();
      expect(result.reviewedAt).toBeNull();
    });

    it('throws NotFoundException when the round does not belong to this style', async () => {
      roundRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.update(STYLE_ID, ROUND_ID, { feedback: 'x' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('presignImage', () => {
    beforeEach(() => {
      roundRepoMock.findOne.mockResolvedValue({
        id: ROUND_ID,
        styleId: STYLE_ID,
      });
    });

    it('builds an objectKey scoped to the style and round', async () => {
      const result = await service.presignImage(STYLE_ID, ROUND_ID, {
        fileName: 'anh.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      });

      expect(result.objectKey).toMatch(
        new RegExp(
          `^styles/${STYLE_ID}/sample-rounds/${ROUND_ID}/images/[0-9a-f-]+\\.png$`,
        ),
      );
    });

    it('rejects a non-image file before calling storage', async () => {
      await expect(
        service.presignImage(STYLE_ID, ROUND_ID, {
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(storageMock.getPresignedPutUrl).not.toHaveBeenCalled();
    });

    it('rejects an image over the 5MB limit', async () => {
      await expect(
        service.presignImage(STYLE_ID, ROUND_ID, {
          fileName: 'anh.png',
          mimeType: 'image/png',
          sizeBytes: 6 * 1024 * 1024,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the round does not exist', async () => {
      roundRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.presignImage(STYLE_ID, ROUND_ID, {
          fileName: 'anh.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmImage', () => {
    beforeEach(() => {
      roundRepoMock.findOne.mockResolvedValue({
        id: ROUND_ID,
        styleId: STYLE_ID,
      });
    });

    it('creates document, version and the image row inside one transaction', async () => {
      const result = await service.confirmImage(STYLE_ID, ROUND_ID, 'user-1', {
        objectKey: `styles/${STYLE_ID}/sample-rounds/${ROUND_ID}/images/x.png`,
        fileName: 'anh.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      });

      expect(docRepoMock.save).toHaveBeenCalledTimes(2);
      expect(txImageRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sampleRoundId: ROUND_ID,
          documentVersionId: 'version-1',
        }),
      );
      expect(result).toMatchObject({
        fileName: 'anh.png',
        mimeType: 'image/png',
      });
    });

    it('rejects when the object was not actually uploaded to S3', async () => {
      storageMock.headObject.mockResolvedValue({ exists: false });

      await expect(
        service.confirmImage(STYLE_ID, ROUND_ID, 'user-1', {
          objectKey: 'x.png',
          fileName: 'anh.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(docRepoMock.save).not.toHaveBeenCalled();
    });
  });

  describe('removeImage', () => {
    beforeEach(() => {
      roundRepoMock.findOne.mockResolvedValue({
        id: ROUND_ID,
        styleId: STYLE_ID,
      });
    });

    it('removes the image row', async () => {
      imageRepoMock.findOne.mockResolvedValue({
        id: 'image-1',
        sampleRoundId: ROUND_ID,
      });

      await service.removeImage(STYLE_ID, ROUND_ID, 'image-1');

      expect(imageRepoMock.remove).toHaveBeenCalledWith({
        id: 'image-1',
        sampleRoundId: ROUND_ID,
      });
    });

    it('throws NotFoundException when there is no such image', async () => {
      imageRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.removeImage(STYLE_ID, ROUND_ID, 'image-1'),
      ).rejects.toThrow(NotFoundException);
      expect(imageRepoMock.remove).not.toHaveBeenCalled();
    });
  });

  describe('getImageDownloadUrl', () => {
    beforeEach(() => {
      roundRepoMock.findOne.mockResolvedValue({
        id: ROUND_ID,
        styleId: STYLE_ID,
      });
    });

    it('presigns a fresh URL with attachment disposition using the original file name', async () => {
      imageRepoMock.createQueryBuilder.mockReturnValue(
        buildSingleRowQueryBuilderMock({
          storageKey: 'styles/x/sample-rounds/y/images/z.png',
          fileName: 'anh.png',
        }),
      );

      const result = await service.getImageDownloadUrl(
        STYLE_ID,
        ROUND_ID,
        'image-1',
      );

      expect(storageMock.getPresignedGetUrl).toHaveBeenCalledWith(
        'styles/x/sample-rounds/y/images/z.png',
        expect.any(Number),
        'anh.png',
      );
      expect(result).toEqual({
        url: 'https://s3.example/get',
        expiresIn: expect.any(Number),
      });
    });

    it('throws NotFoundException when the image does not belong to this round', async () => {
      imageRepoMock.createQueryBuilder.mockReturnValue(
        buildSingleRowQueryBuilderMock(undefined),
      );

      await expect(
        service.getImageDownloadUrl(STYLE_ID, ROUND_ID, 'image-404'),
      ).rejects.toThrow(NotFoundException);
      expect(storageMock.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the round does not belong to this style', async () => {
      roundRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.getImageDownloadUrl(STYLE_ID, ROUND_ID, 'image-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns rounds newest-first with their images grouped', async () => {
      roundRepoMock.find.mockResolvedValue([
        {
          id: ROUND_ID,
          styleId: STYLE_ID,
          roundNo: 2,
          status: SampleStatus.WORKING,
        },
      ]);
      imageRepoMock.createQueryBuilder.mockReturnValue(
        buildQueryBuilderMock([
          {
            id: 'image-1',
            sampleRoundId: ROUND_ID,
            orderIndex: 0,
            storageKey: 'k',
            fileName: 'anh.png',
            mimeType: 'image/png',
            uploadedAt: new Date('2026-01-01'),
          },
        ]),
      );

      const result = await service.list(STYLE_ID);

      expect(result).toHaveLength(1);
      expect(result[0].images).toEqual([
        {
          id: 'image-1',
          url: 'https://s3.example/get',
          fileName: 'anh.png',
          mimeType: 'image/png',
          orderIndex: 0,
          uploadedAt: new Date('2026-01-01'),
        },
      ]);
    });

    it('returns an empty array without querying images when there are no rounds', async () => {
      roundRepoMock.find.mockResolvedValue([]);

      const result = await service.list(STYLE_ID);

      expect(result).toEqual([]);
      expect(imageRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
