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

    const result = await controller.findOne('po-bom-1', req);

    expect(result).toEqual(mockBomList[0]);
    expect(serviceMock.findOne).toHaveBeenCalledWith('po-bom-1', req.user);
  });
});
