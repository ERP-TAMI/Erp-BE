import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMigration1720000000000 implements MigrationInterface {
  name = 'InitialMigration1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  }

  public async down(): Promise<void> {
    // pgcrypto may be shared by other schemas, so the rollback intentionally keeps it.
  }
}
