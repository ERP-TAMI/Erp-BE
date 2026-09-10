import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeadlineFieldToPurchaseOrders1740000000017 implements MigrationInterface {
  name = 'AddDeadlineFieldToPurchaseOrders1740000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_orders
      ADD COLUMN IF NOT EXISTS deadline date;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_orders
      DROP COLUMN IF EXISTS deadline;
    `);
  }
}
