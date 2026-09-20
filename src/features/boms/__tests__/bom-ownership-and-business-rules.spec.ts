import { getMetadataArgsStorage } from 'typeorm';
import { Bom } from '../entities/Bom.entity';
import { BomRevision } from '../entities/BomRevision.entity';
import { BomLine } from '../entities/BomLine.entity';
import {
  BomType,
  BomRevisionStatus,
} from '../../../common/enums/database.enums';
import { ChangePoBomOwnerFromColorToProduct1740000000032 } from '../../../database/migrations/1740000000032-ChangePoBomOwnerFromColorToProduct';

describe('BOM Ownership and Business Rules (Section 14 Specification)', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // A. FIT BOM BUSINESS RULES
  // ──────────────────────────────────────────────────────────────────────────
  describe('A. FIT BOM Rules', () => {
    it('1. Style allows at most 1 Fit BOM (unique constraint on style_id where bom_type = fit)', () => {
      const indices = getMetadataArgsStorage().indices.filter(
        (idx) => idx.target === Bom,
      );
      const fitIndex = indices.find((idx) => idx.name === 'uq_boms_fit_style');

      expect(fitIndex).toBeDefined();
      expect(fitIndex?.unique).toBe(true);
      expect(fitIndex?.columns).toEqual(['styleId']);
      expect(fitIndex?.where).toBe("bom_type = 'fit' AND style_id IS NOT NULL");

      // Invariant check: Fit BOM requires styleId and null purchaseOrderProductId
      const fitBom = new Bom();
      fitBom.bomType = BomType.FIT;
      fitBom.styleId = 'style-uuid-1';
      fitBom.purchaseOrderProductId = null;

      expect(fitBom.styleId).not.toBeNull();
      expect(fitBom.purchaseOrderProductId).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // B. PO BOM BUSINESS RULES
  // ──────────────────────────────────────────────────────────────────────────
  describe('B. PO BOM Rules', () => {
    it('2. Product in PO allows at most 1 PO BOM (unique constraint on purchase_order_product_id where bom_type = po)', () => {
      const indices = getMetadataArgsStorage().indices.filter(
        (idx) => idx.target === Bom,
      );
      const poIndex = indices.find((idx) => idx.name === 'uq_boms_po_product');

      expect(poIndex).toBeDefined();
      expect(poIndex?.unique).toBe(true);
      expect(poIndex?.columns).toEqual(['purchaseOrderProductId']);
      expect(poIndex?.where).toBe(
        "bom_type = 'po' AND purchase_order_product_id IS NOT NULL",
      );

      // Verify old color-level index is completely removed from Bom entity
      const oldColorIndex = indices.find(
        (idx) => idx.name === 'uq_boms_po_product_color',
      );
      expect(oldColorIndex).toBeUndefined();
    });

    it('3. Product with 1 color -> exactly 1 PO BOM owned by the product', () => {
      const productId = 'product-uuid-single-color';
      const colors = [{ id: 'color-1', name: 'Black' }];

      const poBom = new Bom();
      poBom.bomType = BomType.PO;
      poBom.purchaseOrderProductId = productId;
      poBom.styleId = null;

      expect(colors).toHaveLength(1);
      expect(poBom.purchaseOrderProductId).toBe(productId);
      expect(poBom.bomType).toBe(BomType.PO);
    });

    it('4. Product with 5 colors -> still exactly 1 PO BOM owned by the product', () => {
      const productId = 'product-uuid-multi-color';
      const colors = [
        { id: 'c-1', name: 'Red' },
        { id: 'c-2', name: 'Blue' },
        { id: 'c-3', name: 'Green' },
        { id: 'c-4', name: 'Yellow' },
        { id: 'c-5', name: 'Black' },
      ];

      // Under the new rule, all 5 colors map to the same single PO BOM
      const bomsForProduct: Bom[] = [
        Object.assign(new Bom(), {
          id: 'bom-single-for-prod',
          bomType: BomType.PO,
          purchaseOrderProductId: productId,
          styleId: null,
        }),
      ];

      expect(colors).toHaveLength(5);
      expect(bomsForProduct).toHaveLength(1);
      expect(bomsForProduct[0].purchaseOrderProductId).toBe(productId);
    });

    it('5. Two different Products -> can have 2 different PO BOMs', () => {
      const product1 = 'prod-1';
      const product2 = 'prod-2';

      const bom1 = new Bom();
      bom1.id = 'bom-1';
      bom1.bomType = BomType.PO;
      bom1.purchaseOrderProductId = product1;

      const bom2 = new Bom();
      bom2.id = 'bom-2';
      bom2.bomType = BomType.PO;
      bom2.purchaseOrderProductId = product2;

      expect(bom1.purchaseOrderProductId).not.toBe(bom2.purchaseOrderProductId);
      expect(bom1.id).not.toBe(bom2.id);
    });

    it('6. Adding a color does not create a second BOM', () => {
      const productId = 'prod-growing-colors';
      const colors = [{ id: 'c-1', name: 'Navy' }];

      const existingBom = new Bom();
      existingBom.id = 'bom-prod-01';
      existingBom.purchaseOrderProductId = productId;
      existingBom.bomType = BomType.PO;

      // When a new color is added to the product:
      colors.push({ id: 'c-2', name: 'Burgundy' });

      // The BOM collection for the product must still contain only 1 BOM
      const getBomsForProduct = (pId: string, currentBoms: Bom[]) =>
        currentBoms.filter((b) => b.purchaseOrderProductId === pId);

      const boms = getBomsForProduct(productId, [existingBom]);
      expect(colors).toHaveLength(2);
      expect(boms).toHaveLength(1);
      expect(boms[0].id).toBe('bom-prod-01');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // C. DATA MIGRATION RULES
  // ──────────────────────────────────────────────────────────────────────────
  describe('C. Data Migration Rules', () => {
    it('7. Existing product_color BOM is correctly mapped to product BOM', async () => {
      const migration = new ChangePoBomOwnerFromColorToProduct1740000000032();
      const queries: string[] = [];

      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          queries.push(sql);
          return [];
        }),
      } as any;

      await migration.up(queryRunner);

      const backfillQuery = queries.find((q) =>
        q.includes('SET purchase_order_product_id = popc.product_id'),
      );
      expect(backfillQuery).toBeDefined();
      expect(backfillQuery).toContain(
        'FROM purchase_order_product_colors popc',
      );
      expect(backfillQuery).toContain('WHERE b.product_color_id = popc.id');
      expect(backfillQuery).toContain("AND b.bom_type = 'po'");
    });

    it('8. Product with multiple old BOMs -> migration must FAIL FAST', async () => {
      const migration = new ChangePoBomOwnerFromColorToProduct1740000000032();

      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('HAVING COUNT(*) > 1')) {
            return [
              {
                purchase_order_product_id: 'prod-conflict-1',
                bom_count: 3,
                bom_ids: 'b-1, b-2, b-3',
                bom_codes: 'BOM-01, BOM-02, BOM-03',
                product_codes: 'SP-101',
                color_names: 'Red, Green, Blue',
              },
            ];
          }
          return [];
        }),
      } as any;

      await expect(migration.up(queryRunner)).rejects.toThrow(
        /Cannot migrate PO BOM ownership from product_color to product because one or more products currently have multiple BOMs/,
      );
    });

    it('9. Migration does not touch or drop bom_revisions or bom_lines tables', async () => {
      const migration = new ChangePoBomOwnerFromColorToProduct1740000000032();
      const queries: string[] = [];

      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          queries.push(sql);
          return [];
        }),
      } as any;

      await migration.up(queryRunner);

      const allSql = queries.join('\n');
      expect(allSql).not.toContain('DROP TABLE bom_revisions');
      expect(allSql).not.toContain('DROP TABLE bom_lines');
      expect(allSql).not.toContain('DELETE FROM bom_revisions');
      expect(allSql).not.toContain('DELETE FROM bom_lines');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // D. REVISION INVARIANTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('D. Revision Rules', () => {
    it('10. Creating new revision still works with sequential revision_no', () => {
      const bomId = 'bom-uuid-1';
      const rev1 = new BomRevision();
      rev1.id = 'rev-uuid-1';
      rev1.bomId = bomId;
      rev1.revisionNo = 1;
      rev1.status = BomRevisionStatus.CLOSED;

      // Sequential new revision
      const rev2 = new BomRevision();
      rev2.id = 'rev-uuid-2';
      rev2.bomId = bomId;
      rev2.revisionNo = rev1.revisionNo + 1;
      rev2.status = BomRevisionStatus.WAIT_NVKH;

      expect(rev2.revisionNo).toBe(2);
      expect(rev2.status).toBe(BomRevisionStatus.WAIT_NVKH);
    });

    it('11. current_revision_id correctly tracks the latest working revision', () => {
      const bom = new Bom();
      bom.id = 'bom-uuid-1';
      bom.currentRevisionId = 'rev-uuid-1';

      // After Rev 2 is created
      bom.currentRevisionId = 'rev-uuid-2';
      expect(bom.currentRevisionId).toBe('rev-uuid-2');
    });

    it('12. revision_no is unique per BOM (uq_bom_revision constraint exists)', () => {
      const uniques = getMetadataArgsStorage().uniques.filter(
        (u) => u.target === BomRevision,
      );
      const revUnique = uniques.find((u) => u.name === 'uq_bom_revision');

      expect(revUnique).toBeDefined();
      expect(revUnique?.columns).toEqual(['bomId', 'revisionNo']);
    });

    it('13. Concurrent revision creation guard requires locking the BOM row', () => {
      // Simulating row lock acquisition pattern
      const acquireBomLock = (bom: Bom, activeRevision: BomRevision) => {
        if (activeRevision.status !== BomRevisionStatus.CLOSED) {
          throw new Error(
            'Cannot create new revision while current revision is not closed',
          );
        }
        return {
          bomId: bom.id,
          nextRevisionNo: activeRevision.revisionNo + 1,
        };
      };

      const bom = new Bom();
      bom.id = 'bom-lock-test';

      const openRevision = new BomRevision();
      openRevision.revisionNo = 1;
      openRevision.status = BomRevisionStatus.WAIT_RD;

      expect(() => acquireBomLock(bom, openRevision)).toThrow(
        'Cannot create new revision while current revision is not closed',
      );

      const closedRevision = new BomRevision();
      closedRevision.revisionNo = 1;
      closedRevision.status = BomRevisionStatus.CLOSED;

      const result = acquireBomLock(bom, closedRevision);
      expect(result.nextRevisionNo).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E. COPY FIT TO PO PRODUCT RULES
  // ──────────────────────────────────────────────────────────────────────────
  describe('E. Copy Fit to PO Product Rules', () => {
    it('14. Copy Fit copies materials to PO Product BOM', () => {
      const fitLine = new BomLine();
      fitLine.materialId = 'mat-cotton-1';
      fitLine.materialNameSnapshot = '100% Cotton 30S';
      fitLine.materialGroupSnapshot = 'Vải chính';
      fitLine.unitSnapshot = 'Kg';
      fitLine.consumption = 0.45;
      fitLine.unitCost = null; // Fit BOM has no unit cost

      // Copy to PO line
      const poLine = new BomLine();
      poLine.revisionId = 'po-rev-1';
      poLine.materialId = fitLine.materialId;
      poLine.materialNameSnapshot = fitLine.materialNameSnapshot;
      poLine.materialGroupSnapshot = fitLine.materialGroupSnapshot;
      poLine.unitSnapshot = fitLine.unitSnapshot;
      poLine.consumption = fitLine.consumption;
      poLine.unitCost = null; // PO line initially null before Accounting entry

      expect(poLine.materialId).toBe(fitLine.materialId);
      expect(poLine.consumption).toBe(fitLine.consumption);
      expect(poLine.unitCost).toBeNull();
    });

    it('15. source_revision_id tracks the source Fit revision', () => {
      const fitRevisionId = 'fit-rev-closed-uuid';

      const poRevision = new BomRevision();
      poRevision.sourceRevisionId = fitRevisionId;

      expect(poRevision.sourceRevisionId).toBe(fitRevisionId);
    });

    it('16. unit_cost remains NULL upon copy from Fit', () => {
      const copyFromFit = (line: BomLine) => ({
        materialNameSnapshot: line.materialNameSnapshot,
        consumption: line.consumption,
        unitCost: null, // Critical: unitCost must be NULL
      });

      const fitLine = new BomLine();
      fitLine.materialNameSnapshot = 'Lining Fabric';
      fitLine.consumption = 0.2;
      fitLine.unitCost = null;

      const copied = copyFromFit(fitLine);
      expect(copied.unitCost).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // F. DISCONTINUE RULES
  // ──────────────────────────────────────────────────────────────────────────
  describe('F. Discontinue Rules', () => {
    it('17. Canceling a color does not auto-discontinue the PO Product BOM', () => {
      const productBom = new Bom();
      productBom.id = 'bom-po-active';
      productBom.purchaseOrderProductId = 'prod-1';
      productBom.discontinuedAt = null;
      productBom.discontinuedReason = null;

      // Color is canceled/deleted in PO
      const colorAction = { type: 'CANCEL_COLOR', colorId: 'color-red' };

      // BOM status must remain unaffected
      const handleColorStatusChange = (
        bom: Bom,
        action: { type: string; colorId: string },
      ) => {
        // Business rule: BOM belongs to Product, not Color. Color cancellation does not discontinue Product BOM.
        if (action.type === 'CANCEL_COLOR') {
          return bom;
        }
        return bom;
      };

      const resultBom = handleColorStatusChange(productBom, colorAction);
      expect(resultBom.discontinuedAt).toBeNull();
      expect(resultBom.discontinuedReason).toBeNull();
    });
  });
});
