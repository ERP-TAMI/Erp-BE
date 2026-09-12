import { Test, TestingModule } from '@nestjs/testing';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';
import { BomListItemDto } from './dto';

describe('BomsController', () => {
  let controller: BomsController;
  let serviceMock: any;

  const mockBomList: BomListItemDto[] = [
    {
      id: 'po-bom-1',
      objectType: 'po',
      objectCode: 'PO-2026-001',
      poId: 'po-uuid-1',
      styleCode: 'STY-01',
      productName: 'Áo Polo Nam',
      colorName: 'Navy',
      version: 1,
      status: 'Approved',
      totalCostPerUnit: 145000,
      createdAt: '2026-09-12T00:00:00.000Z',
    },
    {
      id: 'fit-bom-1',
      objectType: 'fit',
      objectCode: 'FIT-001',
      poId: '',
      styleCode: 'STY-FIT-01',
      productName: 'Mẫu Fit Polo',
      colorName: 'Tiêu chuẩn',
      version: 1,
      status: 'Draft',
      totalCostPerUnit: null,
      createdAt: '2026-09-11T00:00:00.000Z',
    },
  ];

  const mockPaginatedResponse = {
    data: mockBomList,
    meta: {
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    },
  };

  const mockStats = {
    total: 2,
    draftCount: 1,
    pendingCount: 0,
    approvedCount: 1,
  };

  beforeEach(async () => {
    serviceMock = {
      findAll: jest.fn().mockResolvedValue(mockPaginatedResponse),
      findOne: jest.fn().mockResolvedValue(mockBomList[0]),
      getStats: jest.fn().mockResolvedValue(mockStats),
      listRevisions: jest
        .fn()
        .mockResolvedValue([{ id: 'rev-1', revisionNo: 1 }]),
      createRevision: jest
        .fn()
        .mockResolvedValue({ id: 'rev-2', revisionNo: 2, status: 'draft' }),
      updateDraftRevision: jest
        .fn()
        .mockResolvedValue({ id: 'rev-2', revisionNo: 2 }),
      submitRevisionForReview: jest
        .fn()
        .mockResolvedValue({ id: 'rev-2', status: 'in_review' }),
      approveRevision: jest
        .fn()
        .mockResolvedValue({ id: 'rev-2', status: 'approved' }),
      rejectRevision: jest
        .fn()
        .mockResolvedValue({ id: 'rev-2', status: 'draft' }),
      cancelRevision: jest
        .fn()
        .mockResolvedValue({ id: 'rev-2', status: 'cancelled' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BomsController],
      providers: [
        {
          provide: BomsService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<BomsController>(BomsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll should call service.findAll with query and user', async () => {
    const query = { objectType: 'all' as const, search: 'Polo' };
    const req = { user: { roleCode: 'TPKH' }, headers: {} };

    const result = await controller.findAll(query, req);

    expect(result).toEqual(mockPaginatedResponse);
    expect(serviceMock.findAll).toHaveBeenCalledWith(query, req.user);
  });

  it('getStats should call service.getStats with period', async () => {
    const result = await controller.getStats('2026-09');

    expect(result).toEqual(mockStats);
    expect(serviceMock.getStats).toHaveBeenCalledWith('2026-09');
  });

  it('findOne should call service.findOne with id and user', async () => {
    const req = { user: { roleCode: 'SA' }, headers: {} };

    const result = await controller.findOne('po-bom-1', undefined, req);

    expect(result).toEqual(mockBomList[0]);
    expect(serviceMock.findOne).toHaveBeenCalledWith(
      'po-bom-1',
      req.user,
      undefined,
    );
  });

  it('listRevisions calls service.listRevisions', async () => {
    const req = { user: { roleCode: 'SA' } };
    const res = await controller.listRevisions('po-bom-1', req);
    expect(res).toEqual([{ id: 'rev-1', revisionNo: 1 }]);
    expect(serviceMock.listRevisions).toHaveBeenCalledWith(
      'po-bom-1',
      req.user,
    );
  });

  it('createRevision calls service.createRevision', async () => {
    const req = { user: { roleCode: 'TPKH' } };
    const dto = { changeReason: 'New draft' };
    const res = await controller.createRevision('po-bom-1', dto, req);
    expect(res.revisionNo).toBe(2);
    expect(serviceMock.createRevision).toHaveBeenCalledWith(
      'po-bom-1',
      dto,
      req.user,
    );
  });

  it('cloneRevision calls service.createRevision with cloneFromRevisionId', async () => {
    const req = { user: { roleCode: 'TPKH' } };
    const res = await controller.cloneRevision('po-bom-1', 'rev-1', {}, req);
    expect(res.revisionNo).toBe(2);
    expect(serviceMock.createRevision).toHaveBeenCalledWith(
      'po-bom-1',
      { cloneFromRevisionId: 'rev-1' },
      req.user,
    );
  });

  it('updateDraftRevision calls service.updateDraftRevision', async () => {
    const req = { user: { roleCode: 'TPKH' } };
    const dto = { lines: [{ materialNameSnapshot: 'Vải', unitSnapshot: 'M' }] };
    const res = await controller.updateDraftRevision(
      'po-bom-1',
      'rev-2',
      dto,
      req,
    );
    expect(res.id).toBe('rev-2');
    expect(serviceMock.updateDraftRevision).toHaveBeenCalledWith(
      'po-bom-1',
      'rev-2',
      dto,
      req.user,
    );
  });

  it('submitRevision calls service.submitRevisionForReview', async () => {
    const req = { user: { roleCode: 'TPKH' } };
    const dto = { reason: 'Ready' };
    const res = await controller.submitRevision('po-bom-1', 'rev-2', dto, req);
    expect(res.status).toBe('in_review');
    expect(serviceMock.submitRevisionForReview).toHaveBeenCalledWith(
      'po-bom-1',
      'rev-2',
      dto,
      req.user,
    );
  });

  it('approveRevision calls service.approveRevision', async () => {
    const req = { user: { roleCode: 'SA' } };
    const dto = { effectiveFrom: '2026-06-01' };
    const res = await controller.approveRevision('po-bom-1', 'rev-2', dto, req);
    expect(res.status).toBe('approved');
    expect(serviceMock.approveRevision).toHaveBeenCalledWith(
      'po-bom-1',
      'rev-2',
      dto,
      req.user,
    );
  });

  it('rejectRevision calls service.rejectRevision', async () => {
    const req = { user: { roleCode: 'SA' } };
    const dto = { reason: 'Fix cost' };
    const res = await controller.rejectRevision('po-bom-1', 'rev-2', dto, req);
    expect(res.status).toBe('draft');
    expect(serviceMock.rejectRevision).toHaveBeenCalledWith(
      'po-bom-1',
      'rev-2',
      dto,
      req.user,
    );
  });

  it('cancelRevision calls service.cancelRevision', async () => {
    const req = { user: { roleCode: 'TPKH' } };
    const dto = { reason: 'Cancelled' };
    const res = await controller.cancelRevision('po-bom-1', 'rev-2', dto, req);
    expect(res.status).toBe('cancelled');
    expect(serviceMock.cancelRevision).toHaveBeenCalledWith(
      'po-bom-1',
      'rev-2',
      dto,
      req.user,
    );
  });
});
