import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedDefaultUnits1770000000000 implements MigrationInterface {
  name = 'SeedDefaultUnits1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO units (id, code, name, decimal_scale, status)
      VALUES
        ('00000000-0000-4000-8000-000000000001', 'PCS', 'Cái', 0, 'active'),
        ('00000000-0000-4000-8000-000000000002', 'M', 'Mét', 3, 'active'),
        ('00000000-0000-4000-8000-000000000003', 'KG', 'Kilôgam', 3, 'active'),
        ('00000000-0000-4000-8000-000000000004', 'ROLL', 'Cuộn', 0, 'active'),
        ('00000000-0000-4000-8000-000000000005', 'L', 'Lít', 3, 'active')
      ON CONFLICT (code) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM units AS unit
      WHERE unit.id IN (
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000005'
      )
      AND NOT EXISTS (
        SELECT 1 FROM materials WHERE default_unit_id = unit.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM draft_bom_lines WHERE unit_id = unit.id
      )
    `);
  }
}
