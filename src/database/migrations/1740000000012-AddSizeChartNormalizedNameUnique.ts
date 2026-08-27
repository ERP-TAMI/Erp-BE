import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSizeChartNormalizedNameUnique1740000000012 implements MigrationInterface {
  name = 'AddSizeChartNormalizedNameUnique1740000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM size_charts
          GROUP BY lower(btrim(name))
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Cannot add normalized size chart name uniqueness: duplicate names exist';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_size_charts_name_normalized
      ON size_charts (lower(btrim(name)));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_size_charts_name_normalized;',
    );
  }
}
