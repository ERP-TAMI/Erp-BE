import { createBomAuditServiceMock } from './bom-audit.mock';
import { BadRequestException } from '@nestjs/common';
import { BomsService } from '../boms.service';
import { Bom } from '../entities/Bom.entity';
import { BomRevision } from '../entities/BomRevision.entity';
import { PurchaseOrderProduct } from '../../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/PurchaseOrder.entity';
import {
  BomRevisionStatus,
  BomType,
  PoStatus,
  ProductStatus,
} from '../../../common/enums/database.enums';

describe('BOM của sản phẩm PO đóng băng khi sản phẩm hoặc PO đã khóa', () => {
  let service: BomsService;
  let manager: {
    findOne: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let productStatus: ProductStatus;
  let poStatus: PoStatus;
  let bomType: BomType;

  beforeEach(() => {
    productStatus = ProductStatus.DRAFT;
    poStatus = PoStatus.IN_PROGRESS;
    bomType = BomType.PO;
    manager = {
      findOne: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === Bom) {
          return Promise.resolve(
            Object.assign(new Bom(), {
              id: 'bom-1',
              bomType,
              purchaseOrderProductId: bomType === BomType.PO ? 'pop-1' : null,
              styleId: bomType === BomType.FIT ? 'style-1' : null,
              currentRevisionId: 'rev-1',
              rowVersion: 1,
            }),
          );
        }
        if (entity === BomRevision) {
          return Promise.resolve(
            Object.assign(new BomRevision(), {
              id: 'rev-1',
              bomId: 'bom-1',
              status: BomRevisionStatus.WAIT_NVKH,
              rowVersion: 1,
            }),
          );
        }
        if (entity === PurchaseOrderProduct) {
          return Promise.resolve({
            id: 'pop-1',
            purchaseOrderId: 'po-1',
            status: productStatus,
          });
        }
        if (entity === PurchaseOrder) {
          return Promise.resolve({ id: 'po-1', status: poStatus });
        }
        return Promise.resolve(null);
      }),
      save: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };
    const repo = {} as any;
    service = new BomsService(
      repo,
      repo,
      repo,
      repo,
      repo,
      repo,
      repo,
      repo,
      repo,
      {} as any,
      createBomAuditServiceMock() as any,
      dataSource as any,
    );
  });

  const writes: Array<[string, () => Promise<unknown>]> = [
    ['update', () => service.update('bom-1', {} as any, 'u', 'NVKH')],
    [
      'discontinue',
      () => service.discontinue('bom-1', { reason: 'x' } as any, 'u', 'TPKH'),
    ],
    ['addLine', () => service.addLine('bom-1', {} as any, 'u', 'NVKH')],
    [
      'updateLine',
      () => service.updateLine('bom-1', 'line-1', {} as any, 'u', 'NVKH'),
    ],
    [
      'deleteLine',
      () => service.deleteLine('bom-1', 'line-1', {} as any, 'u', 'NVKH'),
    ],
    [
      'reorderLines',
      () => service.reorderLines('bom-1', { lineIds: [] } as any, 'u', 'NVKH'),
    ],
    ['forward', () => service.forward('bom-1', {} as any, 'u', 'NVKH')],
    ['reject', () => service.reject('bom-1', {} as any, 'u', 'TPKH')],
    ['approve', () => service.approve('bom-1', {} as any, 'u', 'TPKH')],
    [
      'createRevision',
      () =>
        service.createRevision(
          'bom-1',
          { reason: 'Sửa định mức' } as any,
          'u',
          'NVKH',
        ),
    ],
    ['copyFromFit', () => service.copyFromFit('bom-1', {} as any, 'u', 'NVKH')],
    [
      'create',
      () =>
        service.create(
          { type: BomType.PO, purchaseOrderProductId: 'pop-1' } as any,
          'u',
          'NVKH',
        ),
    ],
  ];

  it.each([
    ['sản phẩm đã khóa', 'product', 'Sản phẩm đã bị khóa'],
    ['sản phẩm đã hủy', 'product-cancelled', 'Sản phẩm đã hủy'],
    ['PO đã khóa', 'po-closed', 'Đơn hàng PO đã khóa'],
    ['PO đã hủy', 'po-cancelled', 'Đơn hàng PO đã hủy'],
  ])('%s: mọi thao tác ghi BOM bị chặn', async (_label, lock, msg) => {
    if (lock === 'product') productStatus = ProductStatus.CLOSED;
    if (lock === 'product-cancelled') productStatus = ProductStatus.CANCELLED;
    if (lock === 'po-closed') poStatus = PoStatus.CLOSED;
    if (lock === 'po-cancelled') poStatus = PoStatus.CANCELLED;

    for (const [name, call] of writes) {
      const err = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect({
        name,
        isBadRequest: err instanceof BadRequestException,
      }).toEqual({
        name,
        isBadRequest: true,
      });
      expect({ name, message: (err as Error).message }).toEqual({
        name,
        message: expect.stringContaining(msg),
      });
    }
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('BOM của Mẫu Fit không bị ảnh hưởng bởi kiểm tra này', async () => {
    bomType = BomType.FIT;
    productStatus = ProductStatus.CLOSED;
    poStatus = PoStatus.CANCELLED;

    const err = await service.update('bom-1', {} as any, 'u', 'NVKH').then(
      () => null,
      (e: unknown) => e,
    );

    expect(String((err as Error | null)?.message ?? '')).not.toMatch(
      /đã bị khóa|Đơn hàng PO đã/,
    );
    expect(manager.findOne).not.toHaveBeenCalledWith(
      PurchaseOrderProduct,
      expect.anything(),
    );
  });
});
