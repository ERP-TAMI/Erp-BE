import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUnitDecimalScale1740000000009 implements MigrationInterface {
  name = 'RemoveUnitDecimalScale1740000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE units
        DROP CONSTRAINT units_decimal_scale_check,
        DROP COLUMN decimal_scale;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE units
        ADD COLUMN decimal_scale smallint NOT NULL DEFAULT 4,
        ADD CONSTRAINT units_decimal_scale_check CHECK (decimal_scale >= 0 AND decimal_scale <= 6);
    `);
  }
}
