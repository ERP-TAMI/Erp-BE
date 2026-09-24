import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterBomLineUnitCostScaleTo41740000000034 implements MigrationInterface {
  name = 'AlterBomLineUnitCostScaleTo41740000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bom_lines" ALTER COLUMN "unit_cost" TYPE numeric(20, 4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const precisionViolations = await queryRunner.query(
      `SELECT COUNT(*)::int AS count
       FROM "bom_lines"
       WHERE "unit_cost" IS NOT NULL
         AND ("unit_cost" <> ROUND("unit_cost", 2)
           OR ABS("unit_cost") >= 10000000000000000)`,
    );
    if (Number(precisionViolations[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot downgrade bom_lines.unit_cost to numeric(18,2): values would lose precision or range.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE "bom_lines" ALTER COLUMN "unit_cost" TYPE numeric(18, 2)`,
    );
  }
}
