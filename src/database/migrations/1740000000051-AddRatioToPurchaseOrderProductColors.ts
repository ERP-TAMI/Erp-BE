import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRatioToPurchaseOrderProductColors1740000000051 implements MigrationInterface {
  name = 'AddRatioToPurchaseOrderProductColors1740000000051';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_order_product_colors
        ADD COLUMN IF NOT EXISTS ratio varchar(100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_order_product_colors
        DROP COLUMN IF EXISTS ratio;
    `);
  }
}
