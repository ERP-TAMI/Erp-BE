import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePurchaseOrderCustomerIdNullable1740000000019
  implements MigrationInterface
{
  name = 'MakePurchaseOrderCustomerIdNullable1740000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_orders
      ALTER COLUMN customer_id DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_orders
      ALTER COLUMN customer_id SET NOT NULL;
    `);
  }
}
