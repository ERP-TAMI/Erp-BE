import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterBomLineUnitCostScaleTo41740000000034 implements MigrationInterface {
  name = 'AlterBomLineUnitCostScaleTo41740000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bom_lines" ALTER COLUMN "unit_cost" TYPE numeric(18, 4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bom_lines" ALTER COLUMN "unit_cost" TYPE numeric(18, 2)`,
    );
  }
}
