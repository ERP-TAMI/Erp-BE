import { MigrationInterface, QueryRunner } from 'typeorm';

type DirectorAssignmentCount = {
  assigned_count: string;
};

export class RemoveDirectorManagementAccess1740000000017 implements MigrationInterface {
  name = 'RemoveDirectorManagementAccess1740000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const assignments = (await queryRunner.query(`
      SELECT COUNT(*)::text AS assigned_count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'DIRECTOR';
    `)) as DirectorAssignmentCount[];
    const assignedCount = Number(assignments[0]?.assigned_count ?? 0);

    if (assignedCount > 0) {
      throw new Error(
        `Cannot remove DIRECTOR role while ${assignedCount} user account${assignedCount === 1 ? ' is' : 's are'} still assigned to it`,
      );
    }

    await queryRunner.query(`
      DELETE FROM role_permissions rp
      USING roles r, permissions p
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
        AND r.code = 'DIRECTOR'
        AND p.code = 'management.area.access';
    `);
    await queryRunner.query(`DELETE FROM roles WHERE code = 'DIRECTOR';`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO roles (code, name, description, is_system)
      VALUES (
        'DIRECTOR',
        'Giám đốc',
        'Theo dõi tình hình điều hành và tổng quan đơn hàng',
        true
      )
      ON CONFLICT (code) DO NOTHING;
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.code = 'DIRECTOR'
        AND p.code = 'management.area.access'
      ON CONFLICT (role_id, permission_id) DO NOTHING;
    `);
  }
}
