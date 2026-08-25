import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { StyleOperationStepsService } from '../style-operation-steps.service';
import { StyleOperationStep } from '../entities/StyleOperationStep.entity';
import { Style } from '../entities/Style.entity';

describe('StyleOperationStepsService', () => {
  let service: StyleOperationStepsService;
  let stepRepoMock: any;
  let styleRepoMock: any;

  const mockStyleId = '123e4567-e89b-12d3-a456-426614174000';
  const mockStepId = '987e6543-e89b-12d3-a456-426614174999';

  const mockStyle: Partial<Style> = {
    id: mockStyleId,
    styleCode: 'FIT-2026-001',
    styleName: 'Áo Polo',
    as3bCmBaseDays: 30,
  };

  const mockStep: Partial<StyleOperationStep> = {
    id: mockStepId,
    styleId: mockStyleId,
    stepName: 'Cắt vải',
    description: 'Cắt thân trước và thân sau',
    timePerPiece: 15,
    ssv: 15,
    targetTotal: 1000,
    note: '',
    orderIndex: 0,
    isGroup: false,
    parentStepId: null,
  };

  beforeEach(async () => {
    stepRepoMock = {
      find: jest.fn().mockResolvedValue([mockStep]),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation(async (entity) => {
        if (Array.isArray(entity)) {
          return entity.map((item, idx) => ({
            id: item.id || `gen-${idx}`,
            ...item,
          }));
        }
        return { id: entity.id || mockStepId, ...entity };
      }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      remove: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    styleRepoMock = {
      findOne: jest.fn().mockResolvedValue(mockStyle),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StyleOperationStepsService,
        {
          provide: getRepositoryToken(StyleOperationStep),
          useValue: stepRepoMock,
        },
        {
          provide: getRepositoryToken(Style),
          useValue: styleRepoMock,
        },
      ],
    }).compile();

    service = module.get<StyleOperationStepsService>(
      StyleOperationStepsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByStyleId', () => {
    it('should return list of steps ordered by orderIndex', async () => {
      const result = await service.findByStyleId(mockStyleId);
      expect(styleRepoMock.findOne).toHaveBeenCalledWith({
        where: { id: mockStyleId },
      });
      expect(stepRepoMock.find).toHaveBeenCalledWith({
        where: { styleId: mockStyleId },
        order: { orderIndex: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException if style does not exist', async () => {
      styleRepoMock.findOne.mockResolvedValue(null);
      await expect(service.findByStyleId('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a single operation step', async () => {
      const result = await service.create(mockStyleId, {
        stepName: 'May cổ áo',
        timePerPiece: 20,
        ssv: 20,
      });

      expect(result.stepName).toBe('May cổ áo');
      expect(result.styleId).toBe(mockStyleId);
      expect(stepRepoMock.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if style does not exist', async () => {
      styleRepoMock.findOne.mockResolvedValue(null);
      await expect(
        service.create('invalid-id', { stepName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createMany (bulk save / replace)', () => {
    it('should delete existing steps and save new ones', async () => {
      const steps = [
        { stepName: 'Cắt', timePerPiece: 10, ssv: 10, orderIndex: 0 },
        { stepName: 'May', timePerPiece: 25, ssv: 25, orderIndex: 1 },
      ];

      const result = await service.createMany(mockStyleId, steps, 45);

      expect(styleRepoMock.update).toHaveBeenCalledWith(mockStyleId, {
        as3bCmBaseDays: 45,
      });
      expect(stepRepoMock.delete).toHaveBeenCalledWith({ styleId: mockStyleId });
      expect(stepRepoMock.save).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update step successfully', async () => {
      stepRepoMock.findOne.mockResolvedValue({ ...mockStep });

      const updated = await service.update(mockStepId, {
        stepName: 'Cắt vải chuẩn',
        timePerPiece: 18,
      });

      expect(updated.stepName).toBe('Cắt vải chuẩn');
      expect(updated.timePerPiece).toBe(18);
      expect(stepRepoMock.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if step does not exist', async () => {
      stepRepoMock.findOne.mockResolvedValue(null);
      await expect(
        service.update('non-existing-step', { stepName: 'Abc' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a single step', async () => {
      stepRepoMock.findOne.mockResolvedValue({ ...mockStep, isGroup: false });

      await service.remove(mockStepId);

      expect(stepRepoMock.remove).toHaveBeenCalled();
    });

    it('should cascade delete children when removing a group step', async () => {
      stepRepoMock.findOne.mockResolvedValue({ ...mockStep, isGroup: true });

      await service.remove(mockStepId);

      expect(stepRepoMock.delete).toHaveBeenCalledWith({
        parentStepId: mockStepId,
      });
      expect(stepRepoMock.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException if step to remove does not exist', async () => {
      stepRepoMock.findOne.mockResolvedValue(null);
      await expect(service.remove('non-existing-step')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reorder', () => {
    it('should update orderIndex for ordered step IDs', async () => {
      const orderedIds = ['id-1', 'id-2', 'id-3'];

      await service.reorder(mockStyleId, orderedIds);

      expect(stepRepoMock.update).toHaveBeenCalledTimes(3);
      expect(stepRepoMock.update).toHaveBeenNthCalledWith(1, 'id-1', {
        orderIndex: 0,
      });
      expect(stepRepoMock.update).toHaveBeenNthCalledWith(2, 'id-2', {
        orderIndex: 1,
      });
      expect(stepRepoMock.update).toHaveBeenNthCalledWith(3, 'id-3', {
        orderIndex: 2,
      });
    });

    it('should throw NotFoundException if style does not exist during reorder', async () => {
      styleRepoMock.findOne.mockResolvedValue(null);
      await expect(service.reorder('invalid-id', ['id-1'])).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
