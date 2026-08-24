import { Test, TestingModule } from '@nestjs/testing';
import { StyleProductionDocsController } from './style-production-docs.controller';
import { StyleProductionDocsService } from './style-production-docs.service';
import { ProductionDocStatus } from '../../common/enums/database.enums';

describe('StyleProductionDocsController', () => {
  let controller: StyleProductionDocsController;
  let serviceMock: any;

  const mockResponse = {
    id: 'doc-uuid-123',
    styleId: 'style-uuid-123',
    name: 'Tài liệu sản xuất tiếng Việt',
    description: null,
    status: ProductionDocStatus.DRAFT,
    createdAt: new Date(),
    updatedAt: new Date(),
    sections: [],
    sizeRows: [],
    attachments: [],
  };

  beforeEach(async () => {
    serviceMock = {
      findByStyleId: jest.fn().mockResolvedValue(mockResponse),
      findOne: jest.fn().mockResolvedValue(mockResponse),
      createWithAutoFill: jest.fn().mockResolvedValue(mockResponse),
      update: jest.fn().mockResolvedValue({
        ...mockResponse,
        status: ProductionDocStatus.IN_PROGRESS,
      }),
      updateStatus: jest.fn().mockResolvedValue({
        ...mockResponse,
        status: ProductionDocStatus.COMPLETED,
      }),
      linkAttachment: jest.fn().mockResolvedValue(undefined),
      unlinkAttachment: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StyleProductionDocsController],
      providers: [
        {
          provide: StyleProductionDocsService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<StyleProductionDocsController>(
      StyleProductionDocsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findByStyleId should return production doc detail', async () => {
    const res = await controller.findByStyleId(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(res).toEqual(mockResponse);
  });

  it('create should call createWithAutoFill', async () => {
    const dto = { name: 'Tài liệu mới' };
    const res = await controller.create(
      '123e4567-e89b-12d3-a456-426614174000',
      dto,
    );
    expect(res).toEqual(mockResponse);
    expect(serviceMock.createWithAutoFill).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
      dto,
    );
  });

  it('updateStatus should update status to completed', async () => {
    const res = await controller.updateStatus(
      '123e4567-e89b-12d3-a456-426614174000',
      { status: ProductionDocStatus.COMPLETED },
    );
    expect(res.status).toBe(ProductionDocStatus.COMPLETED);
    expect(serviceMock.updateStatus).toHaveBeenCalled();
  });

  it('unlinkAttachment should call service.unlinkAttachment', async () => {
    await controller.unlinkAttachment(
      '123e4567-e89b-12d3-a456-426614174000',
      '223e4567-e89b-12d3-a456-426614174000',
    );
    expect(serviceMock.unlinkAttachment).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
      '223e4567-e89b-12d3-a456-426614174000',
    );
  });
});
