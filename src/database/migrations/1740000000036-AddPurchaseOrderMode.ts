import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseOrderMode1740000000036 implements MigrationInterface {
  name = 'AddPurchaseOrderMode1740000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN purchase_order_mode varchar(20) NOT NULL DEFAULT 'READ_ONLY';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN purchase_order_mode;
    `);
  }
}
