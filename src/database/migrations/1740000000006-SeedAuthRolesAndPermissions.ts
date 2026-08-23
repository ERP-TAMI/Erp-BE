import { MigrationInterface, QueryRunner } from 'typeorm';

const ROLES: Array<{
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
}> = [
  {
    code: 'SA',
    name: 'Quản trị hệ thống',
    description: 'Toàn quyền quản trị hệ thống',
    isSystem: true,
  },
  {
    code: 'TPKH',
    name: 'Trưởng phòng Kinh doanh',
    description: 'Quản lý dữ liệu và nghiệp vụ kinh doanh',
    isSystem: false,
  },
  {
    code: 'NVKH',
    name: 'Nhân viên Kinh doanh',
    description: 'Thực hiện nghiệp vụ kinh doanh hàng ngày',
    isSystem: false,
  },
  {
    code: 'RD',
    name: 'Nghiên cứu và Phát triển',
    description: 'Nghiên cứu, phát triển mẫu và kiểu dáng sản phẩm',
    isSystem: false,
  },
  {
    code: 'ACCOUNTING',
    name: 'Kế toán',
    description: 'Theo dõi chi phí và số liệu kế toán liên quan sản xuất',
    isSystem: false,
  },
  {
    code: 'IT',
    name: 'Công nghệ thông tin',
    description: 'Quản trị tài khoản và hạ tầng công nghệ thông tin',
    isSystem: true,
  },
];

const PERMISSIONS: Array<{ code: string; description: string }> = [
  {
    code: 'system.users.manage',
    description:
      'Quản lý tài khoản người dùng (tạo, sửa, khoá/mở khoá, gán vai trò)',
  },
  {
    code: 'system.roles.manage',
    description: 'Quản lý vai trò và gán quyền cho vai trò',
  },
  {
    code: 'system.audit.view',
    description: 'Xem nhật ký hoạt động hệ thống (audit log)',
  },
  {
    code: 'master_data.material_groups.view',
    description: 'Xem danh mục nhóm vật tư',
  },
  {
    code: 'master_data.material_groups.manage',
    description: 'Tạo, sửa, xoá nhóm vật tư',
  },
  {
    code: 'master_data.styles.view',
    description: 'Xem danh mục kiểu dáng / mã hàng',
  },
  {
    code: 'master_data.styles.manage',
    description: 'Tạo, sửa, xoá kiểu dáng / mã hàng',
  },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SA: PERMISSIONS.map((p) => p.code),
  IT: ['system.users.manage', 'system.audit.view'],
  TPKH: [
    'master_data.material_groups.view',
    'master_data.material_groups.manage',
    'master_data.styles.view',
    'master_data.styles.manage',
  ],
  NVKH: ['master_data.material_groups.view', 'master_data.styles.view'],
  RD: [
    'master_data.material_groups.view',
    'master_data.styles.view',
    'master_data.styles.manage',
  ],
  ACCOUNTING: ['master_data.material_groups.view', 'master_data.styles.view'],
};

export class SeedAuthRolesAndPermissions1740000000006 implements MigrationInterface {
  name = 'SeedAuthRolesAndPermissions1740000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const role of ROLES) {
      await queryRunner.query(
        `INSERT INTO roles (code, name, description, is_system)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO NOTHING`,
        [role.code, role.name, role.description, role.isSystem],
      );
    }

    for (const permission of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO permissions (code, description)
         VALUES ($1, $2)
         ON CONFLICT (code) DO NOTHING`,
        [permission.code, permission.description],
      );
    }

    for (const [roleCode, permissionCodes] of Object.entries(
      ROLE_PERMISSIONS,
    )) {
      for (const permissionCode of permissionCodes) {
        await queryRunner.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT r.id, p.id
           FROM roles r, permissions p
           WHERE r.code = $1 AND p.code = $2
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [roleCode, permissionCode],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const roleCodes = ROLES.map((r) => r.code);
    const permissionCodes = PERMISSIONS.map((p) => p.code);

    await queryRunner.query(
      `DELETE FROM role_permissions
       WHERE role_id IN (SELECT id FROM roles WHERE code = ANY($1))
          OR permission_id IN (SELECT id FROM permissions WHERE code = ANY($2))`,
      [roleCodes, permissionCodes],
    );
    await queryRunner.query(`DELETE FROM permissions WHERE code = ANY($1)`, [
      permissionCodes,
    ]);
    await queryRunner.query(`DELETE FROM roles WHERE code = ANY($1)`, [
      roleCodes,
    ]);
  }
}
