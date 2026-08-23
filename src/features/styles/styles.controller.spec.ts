import { Test, TestingModule } from '@nestjs/testing';
import { StylesController } from './styles.controller';
import { StylesService } from './styles.service';
import { StyleStatus } from '../../common/enums/database.enums';

describe('StylesController', () => {
  let controller: StylesController;
  let serviceMock: any;

  const mockStyle = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    styleCode: 'FIT-2026-001',
    styleName: 'Áo Polo Nam',
    status: StyleStatus.DRAFT,
  };

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn().mockResolvedValue(mockStyle),
      findAll: jest.fn().mockResolvedValue({
        data: [mockStyle],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }),
      findOne: jest.fn().mockResolvedValue(mockStyle),
      findByCode: jest.fn().mockResolvedValue(mockStyle),
      update: jest.fn().mockResolvedValue({ ...mockStyle, status: StyleStatus.ACTIVE }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StylesController],
      providers: [
        {
          provide: StylesService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<StylesController>(StylesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create should call service.create', async () => {
    const dto = { styleCode: 'FIT-2026-001', styleName: 'Áo Polo Nam' };
    const res = await controller.create(dto);
    expect(res).toEqual(mockStyle);
    expect(serviceMock.create).toHaveBeenCalledWith(dto, undefined);
  });

  it('findAll should return paginated list', async () => {
    const res = await controller.findAll({ page: 1, limit: 10 });
    expect(res.data).toHaveLength(1);
    expect(serviceMock.findAll).toHaveBeenCalled();
  });

  it('findOne should return style by id', async () => {
    const res = await controller.findOne('123e4567-e89b-12d3-a456-426614174000');
    expect(res).toEqual(mockStyle);
    expect(serviceMock.findOne).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
  });

  it('update should return updated style', async () => {
    const res = await controller.update('123e4567-e89b-12d3-a456-426614174000', {
      status: StyleStatus.ACTIVE,
    });
    expect(res.status).toBe(StyleStatus.ACTIVE);
    expect(serviceMock.update).toHaveBeenCalled();
  });
});
