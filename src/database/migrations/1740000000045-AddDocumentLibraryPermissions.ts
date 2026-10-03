import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSIONS = [
  {
    code: 'master_data.documents.view',
    description: 'Xem và tải tài liệu trong kho dùng chung',
  },
  {
    code: 'master_data.documents.manage',
    description: 'Quản lý thư mục, tải tài liệu và tạo phiên bản mới trong kho',
  },
  {
    code: 'master_data.documents.assign',
    description: 'Gán tài liệu trong kho vào mẫu Fit',
  },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SA: [
    'master_data.documents.view',
    'master_data.documents.manage',
    'master_data.documents.assign',
  ],
  TPKH: [
    'master_data.documents.view',
    'master_data.documents.manage',
    'master_data.documents.assign',
  ],
  RD: ['master_data.documents.view', 'master_data.documents.assign'],
  NVKH: ['master_data.documents.view', 'master_data.documents.assign'],
};

export class AddDocumentLibraryPermissions1740000000045 implements MigrationInterface {
  name = 'AddDocumentLibraryPermissions1740000000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const permission of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO permissions (code, description)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
        [permission.code, permission.description],
      );
    }

    for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permissionCode of codes) {
        await queryRunner.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT r.id, p.id
           FROM roles r CROSS JOIN permissions p
           WHERE r.code = $1 AND p.code = $2
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [roleCode, permissionCode],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM role_permissions rp
       USING roles r, permissions p
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
         AND r.code = ANY($1) AND p.code = ANY($2)`,
      [Object.keys(ROLE_PERMISSIONS), PERMISSIONS.map((p) => p.code)],
    );
    await queryRunner.query(`DELETE FROM permissions WHERE code = ANY($1)`, [
      PERMISSIONS.map((p) => p.code),
    ]);
  }
}
