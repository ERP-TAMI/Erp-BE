import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManagementAreaAccess1740000000016 implements MigrationInterface {
  name = 'AddManagementAreaAccess1740000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      INSERT INTO permissions (code, description)
      VALUES ('management.area.access', 'Truy cập khu Quản lý')
      ON CONFLICT (code) DO NOTHING;
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.code IN ('SA', 'DIRECTOR')
        AND p.code = 'management.area.access'
      ON CONFLICT (role_id, permission_id) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions rp
      USING permissions p
      WHERE rp.permission_id = p.id
        AND p.code = 'management.area.access';
    `);
    await queryRunner.query(
      `DELETE FROM permissions WHERE code = 'management.area.access';`,
    );
    await queryRunner.query(`
      DELETE FROM roles r
      WHERE r.code = 'DIRECTOR'
        AND NOT EXISTS (
          SELECT 1
          FROM user_roles ur
          WHERE ur.role_id = r.id
        );
    `);
  }
}
