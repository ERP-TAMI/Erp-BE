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
      totalCostPerUnit: 120000,
      createdAt: '2026-09-11T00:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    serviceMock = {
      findAll: jest.fn().mockResolvedValue(mockBomList),
      findOne: jest.fn().mockResolvedValue(mockBomList[0]),
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

  it('findAll should call service.findAll with query, user and headerRole', async () => {
    const query = { objectType: 'all' as const, search: 'Polo' };
    const req = { user: { roleCode: 'TPKH' }, headers: {} };

    const result = await controller.findAll(query, req);

    expect(result).toEqual(mockBomList);
    expect(serviceMock.findAll).toHaveBeenCalledWith(query, req.user, undefined);
  });

  it('findOne should call service.findOne with id and auth context', async () => {
    const req = { user: { roleCode: 'SA' }, headers: {} };

    const result = await controller.findOne('po-bom-1', req);

    expect(result).toEqual(mockBomList[0]);
    expect(serviceMock.findOne).toHaveBeenCalledWith('po-bom-1', req.user, undefined);
  });
});
