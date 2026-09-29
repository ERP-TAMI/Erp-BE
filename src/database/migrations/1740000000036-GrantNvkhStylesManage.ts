import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantNvkhStylesManage1740000000036 implements MigrationInterface {
  name = 'GrantNvkhStylesManage1740000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r, permissions p
      WHERE r.code = 'NVKH' AND p.code = 'master_data.styles.manage'
      ON CONFLICT (role_id, permission_id) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions rp
      USING roles r, permissions p
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
        AND r.code = 'NVKH'
        AND p.code = 'master_data.styles.manage';
    `);
  }
}
