import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lịch sử PO/sản phẩm PO giờ ghi vào audit_events (giống Mẫu Fit). Hai bảng
 * cũ chưa từng hiện lên FE nên bỏ hẳn, không chuyển dữ liệu.
 */
export class DropPurchaseOrderStatusHistoryTables1740000000043 implements MigrationInterface {
  name = 'DropPurchaseOrderStatusHistoryTables1740000000043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS purchase_order_product_status_history;`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS purchase_order_status_history;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE purchase_order_status_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
        old_status po_status,
        new_status po_status NOT NULL,
        action varchar(50) NOT NULL,
        reason text,
        changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        changed_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX ix_po_status_history ON purchase_order_status_history (purchase_order_id, changed_at DESC, id DESC);`,
    );
    await queryRunner.query(`
      CREATE TABLE purchase_order_product_status_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id uuid NOT NULL REFERENCES purchase_order_products(id) ON DELETE RESTRICT,
        old_status product_status,
        new_status product_status NOT NULL,
        action varchar(50) NOT NULL,
        reason text,
        changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        changed_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX ix_product_status_history ON purchase_order_product_status_history (product_id, changed_at DESC, id DESC);`,
    );
  }
}
