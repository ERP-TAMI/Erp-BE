import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropColorCodeFromPurchaseOrderProductColors1740000000027
  implements MigrationInterface
{
  name = 'DropColorCodeFromPurchaseOrderProductColors1740000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_order_product_colors
        DROP COLUMN IF EXISTS color_code;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_order_product_colors
        ADD COLUMN IF NOT EXISTS color_code varchar(50);
    `);
  }
}
