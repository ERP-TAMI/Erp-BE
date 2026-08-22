import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { StylesService } from './styles.service';
import { Style } from './entities/Style.entity';
import { StyleStatus } from '../../common/enums/database.enums';

describe('StylesService', () => {
  let service: StylesService;
  let repositoryMock: any;

  const mockStyle: Partial<Style> = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    styleCode: 'FIT-2026-001',
    styleName: 'Áo Polo Nam',
    description: 'Mẫu Polo Nam 2026',
    category: 'Áo Polo',
    status: StyleStatus.DRAFT,
    rowVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repositoryMock = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation(async (style) => ({
        id: '123e4567-e89b-12d3-a456-426614174000',
        ...style,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockStyle], 1]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StylesService,
        {
          provide: getRepositoryToken(Style),
          useValue: repositoryMock,
        },
      ],
    }).compile();

    service = module.get<StylesService>(StylesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new style successfully', async () => {
      repositoryMock.findOne.mockResolvedValue(null);

      const result = await service.create({
        styleCode: 'FIT-2026-001',
        styleName: 'Áo Polo Nam',
        category: 'Áo Polo',
      });

      expect(result.styleCode).toBe('FIT-2026-001');
      expect(result.status).toBe(StyleStatus.DRAFT);
      expect(repositoryMock.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if styleCode already exists', async () => {
      repositoryMock.findOne.mockResolvedValue(mockStyle);

      await expect(
        service.create({
          styleCode: 'FIT-2026-001',
          styleName: 'Áo Polo Nam',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if styleCode is empty', async () => {
      await expect(
        service.create({
          styleCode: '   ',
          styleName: 'Áo Polo Nam',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if styleName is empty', async () => {
      await expect(
        service.create({
          styleCode: 'FIT-2026-001',
          styleName: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated result', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a style if found', async () => {
      repositoryMock.findOne.mockResolvedValue(mockStyle);

      const result = await service.findOne('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toEqual(mockStyle);
    });

    it('should throw NotFoundException if not found', async () => {
      repositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update style fields and status', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });

      const updated = await service.update('123e4567-e89b-12d3-a456-426614174000', {
        styleName: 'Áo Polo Nam Mới',
        status: StyleStatus.APPROVED,
      });

      expect(updated.styleName).toBe('Áo Polo Nam Mới');
      expect(updated.status).toBe(StyleStatus.APPROVED);
    });

    it('should throw BadRequestException if updating styleName to whitespace', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });

      await expect(
        service.update('123e4567-e89b-12d3-a456-426614174000', {
          styleName: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
