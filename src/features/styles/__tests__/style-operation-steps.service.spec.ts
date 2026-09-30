import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StyleOperationStepsService } from '../style-operation-steps.service';
import { StyleOperationStep } from '../entities/StyleOperationStep.entity';
import { Style } from '../entities/Style.entity';
import { AuditService } from '../../audit/audit.service';
import { AuditEventType } from '../../../common/enums/database.enums';

const testActor = { id: 'actor-1', roleCode: 'RD' };

describe('StyleOperationStepsService', () => {
  let service: StyleOperationStepsService;
  let stepRepoMock: any;
  let styleRepoMock: any;
  let dataSourceMock: any;
  let auditServiceMock: jest.Mocked<Pick<AuditService, 'recordEntityChange'>>;

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
      query: jest.fn().mockResolvedValue([]),
    };

    styleRepoMock = {
      findOne: jest.fn().mockResolvedValue(mockStyle),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    // createMany() now runs inside dataSource.transaction(); the mock just
    // invokes the callback with a manager whose getRepository()/query()
    // delegate to the same repo mocks, so existing assertions on
    // stepRepoMock/styleRepoMock keep working unchanged.
    dataSourceMock = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const manager = {
          getRepository: (entity: any) =>
            entity === Style ? styleRepoMock : stepRepoMock,
          query: (...args: any[]) => stepRepoMock.query(...args),
        };
        return cb(manager);
      }),
    };

    auditServiceMock = {
      recordEntityChange: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: AuditService,
          useValue: auditServiceMock,
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
      const result = await service.create(
        mockStyleId,
        {
          stepName: 'May cổ áo',
          timePerPiece: 20,
          ssv: 20,
        },
        testActor,
      );

      expect(result.stepName).toBe('May cổ áo');
      expect(result.styleId).toBe(mockStyleId);
      expect(stepRepoMock.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if style does not exist', async () => {
      styleRepoMock.findOne.mockResolvedValue(null);
      await expect(
        service.create('invalid-id', { stepName: 'Test' }, testActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if stageId does not exist', async () => {
      stepRepoMock.query.mockResolvedValue([]);
      await expect(
        service.create(
          mockStyleId,
          {
            stepName: 'Test',
            stageId: 'non-existing-stage',
          },
          testActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createMany (bulk save / replace)', () => {
    it('should delete existing steps and save new ones', async () => {
      const steps = [
        { stepName: 'Cắt', timePerPiece: 10, ssv: 10, orderIndex: 0 },
        { stepName: 'May', timePerPiece: 25, ssv: 25, orderIndex: 1 },
      ];

      const result = await service.createMany(
        mockStyleId,
        steps,
        45,
        testActor,
      );

      expect(styleRepoMock.update).toHaveBeenCalledWith(mockStyleId, {
        as3bCmBaseDays: 45,
      });
      expect(stepRepoMock.query).toHaveBeenCalledWith(
        'DELETE FROM style_operation_steps WHERE style_id = $1',
        [mockStyleId],
      );
      expect(stepRepoMock.save).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should map temporary FE group/child IDs to valid database entities', async () => {
      const steps = [
        {
          id: 'group-1787700099',
          isGroup: true,
          stepName: 'Nhóm vắt sổ',
          orderIndex: 0,
        },
        {
          id: 'child-1787700099',
          isGroup: false,
          parentStepId: 'group-1787700099',
          stepName: 'VS3C',
          orderIndex: 1,
        },
      ];

      const result = await service.createMany(mockStyleId, steps as any);

      expect(stepRepoMock.query).toHaveBeenCalledWith(
        'DELETE FROM style_operation_steps WHERE style_id = $1',
        [mockStyleId],
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).not.toBe('group-1787700099');
      expect(result[1].id).not.toBe('child-1787700099');
      expect(result[1].parentStepId).toBe(result[0].id);
    });

    it('should reject the whole batch (not silently null it out) when a step references a non-existing stageId', async () => {
      const steps = [
        {
          stepName: 'Cắt',
          timePerPiece: 10,
          ssv: 10,
          orderIndex: 0,
          stageId: 'non-existing-stage-id',
        },
      ];

      await expect(
        service.createMany(mockStyleId, steps as any),
      ).rejects.toThrow(BadRequestException);
      // Must not have gone on to save a row with the reference silently dropped.
      expect(stepRepoMock.save).not.toHaveBeenCalled();
    });

    it('should reject the whole batch when a step references a non-existing groupId', async () => {
      const steps = [
        {
          stepName: 'Nhóm vắt sổ',
          isGroup: true,
          orderIndex: 0,
          groupId: 'non-existing-group-id',
        },
      ];

      await expect(
        service.createMany(mockStyleId, steps as any),
      ).rejects.toThrow(BadRequestException);
      expect(stepRepoMock.save).not.toHaveBeenCalled();
    });

    it('records exactly one audit event for a multi-row save, not one per row', async () => {
      stepRepoMock.find.mockResolvedValueOnce([]);
      const steps = [
        { stepName: 'Cắt', timePerPiece: 10, ssv: 10, orderIndex: 0 },
        { stepName: 'May', timePerPiece: 25, ssv: 25, orderIndex: 1 },
      ];

      await service.createMany(mockStyleId, steps as any, undefined, testActor);

      expect(auditServiceMock.recordEntityChange).toHaveBeenCalledTimes(1);
      const [, input] = auditServiceMock.recordEntityChange.mock.calls[0];
      expect(input.eventType).toBe(AuditEventType.CREATED);
      expect(input.aggregateId).toBe(mockStyleId);
      expect(input.reason).toContain('Tạo mới 2 công đoạn (Cắt, May)');
      expect(
        input.changes.some((c: any) => c.fieldName === 'Cắt::stepName'),
      ).toBe(true);
      expect(
        input.changes.some((c: any) => c.fieldName === 'May::stepName'),
      ).toBe(true);
    });

    it('records one event covering create + update + delete together when a save mixes all three', async () => {
      const secondExistingStep: Partial<StyleOperationStep> = {
        id: 'existing-step-2',
        styleId: mockStyleId,
        stepName: 'Ủi',
        timePerPiece: 5,
        ssv: 5,
        targetTotal: 100,
        orderIndex: 1,
        isGroup: false,
        parentStepId: null,
      };
      stepRepoMock.find.mockResolvedValueOnce([mockStep, secondExistingStep]);
      // The shared save mock falls back to the same mockStepId for every
      // entity that has no id of its own — fine for single-row tests, but
      // here it would collapse the one genuinely-new row onto mockStepId
      // and get misread as an update. Give each id-less entity its own id.
      let newRowCounter = 0;
      stepRepoMock.save.mockImplementation(async (entity: any) => ({
        id: entity.id || `new-row-${newRowCounter++}`,
        ...entity,
      }));

      const steps = [
        {
          id: mockStepId,
          stepName: 'Cắt vải (đã sửa)',
          timePerPiece: 20,
          ssv: 20,
          orderIndex: 0,
        },
        { stepName: 'May cổ', timePerPiece: 12, ssv: 12, orderIndex: 1 },
        // "Ủi" (existing-step-2) is intentionally left out — it gets deleted.
      ];

      await service.createMany(mockStyleId, steps as any, undefined, testActor);

      expect(auditServiceMock.recordEntityChange).toHaveBeenCalledTimes(1);
      const [, input] = auditServiceMock.recordEntityChange.mock.calls[0];
      expect(input.eventType).toBe(AuditEventType.UPDATED);
      expect(input.reason).toContain('Tạo mới 1 công đoạn (May cổ)');
      expect(input.reason).toContain('Cập nhật 1 công đoạn (Cắt vải (đã sửa))');
      expect(input.reason).toContain('Xoá 1 công đoạn (Ủi)');
    });

    it('records one DELETED event when the whole grid is cleared', async () => {
      const steps: any[] = [];

      await service.createMany(mockStyleId, steps, undefined, testActor);

      expect(auditServiceMock.recordEntityChange).toHaveBeenCalledTimes(1);
      const [, input] = auditServiceMock.recordEntityChange.mock.calls[0];
      expect(input.eventType).toBe(AuditEventType.DELETED);
      expect(input.reason).toContain('Xoá 1 công đoạn (Cắt vải)');
    });

    it('does not record any audit event when no actor is given', async () => {
      stepRepoMock.find.mockResolvedValueOnce([]);
      const steps = [
        { stepName: 'Cắt', timePerPiece: 10, ssv: 10, orderIndex: 0 },
      ];

      await service.createMany(mockStyleId, steps as any);

      expect(auditServiceMock.recordEntityChange).not.toHaveBeenCalled();
    });

    it("resolves stageId to the stage's real name in a bulk save instead of a raw UUID", async () => {
      const STAGE_ID = '11111111-1111-1111-1111-111111111111';
      stepRepoMock.find.mockResolvedValueOnce([]);
      stepRepoMock.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM stages')) {
          return Promise.resolve([{ id: STAGE_ID, stage_name: 'Xưởng cắt' }]);
        }
        return Promise.resolve([]);
      });

      const steps = [
        {
          stepName: 'Cắt vải',
          timePerPiece: 10,
          ssv: 10,
          orderIndex: 0,
          stageId: STAGE_ID,
        },
      ];

      await service.createMany(mockStyleId, steps as any, undefined, testActor);

      const [, input] = auditServiceMock.recordEntityChange.mock.calls[0];
      const stageChange = input.changes.find(
        (c: any) => c.fieldName === 'Cắt vải::stageId',
      );
      expect(stageChange).toMatchObject({
        oldValue: null,
        newValue: 'Xưởng cắt',
      });
    });
  });

  describe('update', () => {
    it('should update step successfully', async () => {
      stepRepoMock.findOne.mockResolvedValue({ ...mockStep });

      const updated = await service.update(
        mockStyleId,
        mockStepId,
        {
          stepName: 'Cắt vải chuẩn',
          timePerPiece: 18,
        },
        testActor,
      );

      expect(updated.stepName).toBe('Cắt vải chuẩn');
      expect(updated.timePerPiece).toBe(18);
      expect(stepRepoMock.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if step does not exist', async () => {
      stepRepoMock.findOne.mockResolvedValue(null);
      await expect(
        service.update(
          mockStyleId,
          'non-existing-step',
          { stepName: 'Abc' },
          testActor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if step belongs to a different style', async () => {
      stepRepoMock.findOne.mockResolvedValue({
        ...mockStep,
        styleId: 'some-other-style-id',
      });
      await expect(
        service.update(mockStyleId, mockStepId, { stepName: 'Abc' }, testActor),
      ).rejects.toThrow(NotFoundException);
    });

    it("resolves stageId to the stage's real name in the audit change instead of a raw UUID", async () => {
      const STAGE_ID = '11111111-1111-1111-1111-111111111111';
      stepRepoMock.findOne.mockResolvedValueOnce({
        ...mockStep,
        stageId: null,
      });
      stepRepoMock.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM stages')) {
          return Promise.resolve([{ stage_name: 'Xưởng cắt' }]);
        }
        return Promise.resolve([]);
      });

      await service.update(
        mockStyleId,
        mockStepId,
        { stageId: STAGE_ID },
        testActor,
      );

      const [, input] = auditServiceMock.recordEntityChange.mock.calls[0];
      const stageChange = input.changes.find(
        (c: any) => c.fieldName === 'stageId',
      );
      expect(stageChange).toMatchObject({
        oldValue: null,
        newValue: 'Xưởng cắt',
      });
    });

    it('should throw BadRequestException if stageId does not exist', async () => {
      stepRepoMock.findOne.mockResolvedValue({ ...mockStep });
      stepRepoMock.query.mockResolvedValue([]);
      await expect(
        service.update(
          mockStyleId,
          mockStepId,
          {
            stageId: 'non-existing-stage',
          },
          testActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if parentStepId does not exist', async () => {
      stepRepoMock.findOne
        .mockResolvedValueOnce({ ...mockStep }) // findOwnedStep
        .mockResolvedValueOnce(null); // parent lookup
      await expect(
        service.update(
          mockStyleId,
          mockStepId,
          {
            parentStepId: 'non-existing-parent',
          },
          testActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should remove a single step', async () => {
      stepRepoMock.findOne.mockResolvedValue({ ...mockStep, isGroup: false });

      await service.remove(mockStyleId, mockStepId, testActor);

      expect(stepRepoMock.remove).toHaveBeenCalled();
    });

    it('should cascade delete children when removing a group step', async () => {
      stepRepoMock.findOne.mockResolvedValue({ ...mockStep, isGroup: true });

      await service.remove(mockStyleId, mockStepId, testActor);

      expect(stepRepoMock.delete).toHaveBeenCalledWith({
        parentStepId: mockStepId,
      });
      expect(stepRepoMock.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException if step to remove does not exist', async () => {
      stepRepoMock.findOne.mockResolvedValue(null);
      await expect(
        service.remove(mockStyleId, 'non-existing-step', testActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if step to remove belongs to a different style', async () => {
      stepRepoMock.findOne.mockResolvedValue({
        ...mockStep,
        styleId: 'some-other-style-id',
      });
      await expect(
        service.remove(mockStyleId, mockStepId, testActor),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
