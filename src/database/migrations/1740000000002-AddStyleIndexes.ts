import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStyleIndexes1740000000002 implements MigrationInterface {
  name = 'AddStyleIndexes1740000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_styles_lookup 
      ON styles (status, category, created_at DESC, id DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_styles_lookup;`);
  }
}
