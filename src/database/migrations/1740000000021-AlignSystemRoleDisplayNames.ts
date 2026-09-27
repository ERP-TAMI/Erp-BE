import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignSystemRoleDisplayNames1740000000021 implements MigrationInterface {
  name = 'AlignSystemRoleDisplayNames1740000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE roles
      SET name = CASE code
        WHEN 'SA' THEN 'SA / Giám đốc'
        WHEN 'RD' THEN 'R&D'
        WHEN 'IT' THEN 'IT'
      END
      WHERE code IN ('SA', 'RD', 'IT')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE roles
      SET name = CASE code
        WHEN 'SA' THEN 'Quản trị hệ thống'
        WHEN 'RD' THEN 'Nghiên cứu và Phát triển'
        WHEN 'IT' THEN 'Công nghệ thông tin'
      END
      WHERE code IN ('SA', 'RD', 'IT')
    `);
  }
}
