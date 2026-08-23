import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { hashPassword } from '../../common/security/password.util';

export type SeedAccount = {
  email: string;
  fullName: string;
  roleCode: string;
};

export const SEED_ACCOUNTS: SeedAccount[] = [
  { email: 'sa@tami.test', fullName: 'Quản trị hệ thống', roleCode: 'SA' },
  {
    email: 'tpkh@tami.test',
    fullName: 'Trưởng phòng Kinh doanh',
    roleCode: 'TPKH',
  },
  {
    email: 'nvkh@tami.test',
    fullName: 'Nhân viên Kinh doanh',
    roleCode: 'NVKH',
  },
  {
    email: 'rd@tami.test',
    fullName: 'Nghiên cứu và Phát triển',
    roleCode: 'RD',
  },
  {
    email: 'accounting@tami.test',
    fullName: 'Kế toán',
    roleCode: 'ACCOUNTING',
  },
  {
    email: 'it@tami.test',
    fullName: 'Công nghệ thông tin',
    roleCode: 'IT',
  },
];

export async function seedAuthTestAccount(
  manager: EntityManager,
  account: SeedAccount,
  passwordHash: string,
): Promise<void> {
  const roleRows: Array<{ id: string }> = await manager.query(
    `SELECT id FROM roles WHERE code = $1`,
    [account.roleCode],
  );
  if (roleRows.length === 0) {
    throw new Error(
      `Role code "${account.roleCode}" not found. Run "npm run migration:run" before seeding test accounts.`,
    );
  }
  const roleId = roleRows[0].id;

  const existingUser: Array<{ id: string }> = await manager.query(
    `SELECT id FROM users WHERE email = $1`,
    [account.email],
  );

  let userId: string;
  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    await manager.query(
      `UPDATE users
       SET password_hash = $1, full_name = $2, status = 'active'::record_status, must_change_password = false
       WHERE id = $3`,
      [passwordHash, account.fullName, userId],
    );
  } else {
    const inserted: Array<{ id: string }> = await manager.query(
      `INSERT INTO users (email, password_hash, full_name, status, must_change_password)
       VALUES ($1, $2, $3, 'active'::record_status, false)
       RETURNING id`,
      [account.email, passwordHash, account.fullName],
    );
    userId = inserted[0].id;
  }

  await manager.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
  await manager.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES ($1, $2, now())`,
    [userId, roleId],
  );
}

export async function seedAuthTestAccounts(
  dataSource: DataSource,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);

  for (const account of SEED_ACCOUNTS) {
    await dataSource.transaction(async (manager) => {
      await seedAuthTestAccount(manager, account, passwordHash);
      console.log(`Seeded ${account.email} (${account.roleCode})`);
    });
  }
}

async function main(): Promise<void> {
  const password = process.env.SEED_TEST_ACCOUNT_PASSWORD;
  if (!password) {
    throw new Error(
      'SEED_TEST_ACCOUNT_PASSWORD is not set. Set it in your local .env (never commit the value) before running this seed script.',
    );
  }

  await AppDataSource.initialize();
  try {
    await seedAuthTestAccounts(AppDataSource, password);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed auth test accounts failed:', error);
    process.exitCode = 1;
  });
}
