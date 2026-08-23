import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveStyleApprovedStatus1740000000003 implements MigrationInterface {
  name = 'RemoveStyleApprovedStatus1740000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM styles WHERE status = 'approved') THEN
          RAISE EXCEPTION
            'Cannot drop style_status value "approved": rows still use it';
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TYPE style_status RENAME TO style_status_old;`,
    );
    await queryRunner.query(
      `CREATE TYPE style_status AS ENUM ('draft', 'active');`,
    );
    await queryRunner.query(
      `ALTER TABLE styles ALTER COLUMN status DROP DEFAULT;`,
    );
    await queryRunner.query(`
      ALTER TABLE styles
      ALTER COLUMN status TYPE style_status USING status::text::style_status;
    `);
    await queryRunner.query(
      `ALTER TABLE styles ALTER COLUMN status SET DEFAULT 'draft';`,
    );
    await queryRunner.query(`DROP TYPE style_status_old;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE style_status RENAME TO style_status_new;`,
    );
    await queryRunner.query(
      `CREATE TYPE style_status AS ENUM ('draft', 'approved', 'active');`,
    );
    await queryRunner.query(
      `ALTER TABLE styles ALTER COLUMN status DROP DEFAULT;`,
    );
    await queryRunner.query(`
      ALTER TABLE styles
      ALTER COLUMN status TYPE style_status USING status::text::style_status;
    `);
    await queryRunner.query(
      `ALTER TABLE styles ALTER COLUMN status SET DEFAULT 'draft';`,
    );
    await queryRunner.query(`DROP TYPE style_status_new;`);
  }
}
