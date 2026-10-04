import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { hashPassword } from '../../common/security/password.util';

export type BootstrapAccount = {
  email: string;
  password: string;
  fullName: string;
  roleCode: 'SA' | 'IT' | 'TPKH' | 'NVKH' | 'RD' | 'ACCOUNTING';
};

// Same minimum as the app's own password setup (MinLength(8)).
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SLOTS = [
  { prefix: 'BOOTSTRAP_ADMIN', fullName: 'Quản trị hệ thống', roleCode: 'SA' },
  { prefix: 'BOOTSTRAP_IT', fullName: 'Công nghệ thông tin', roleCode: 'IT' },
  {
    prefix: 'BOOTSTRAP_TPKH',
    fullName: 'Trưởng phòng Kế hoạch',
    roleCode: 'TPKH',
  },
  {
    prefix: 'BOOTSTRAP_NVKH',
    fullName: 'Nhân viên Kế hoạch',
    roleCode: 'NVKH',
  },
  {
    prefix: 'BOOTSTRAP_RD',
    fullName: 'Nghiên cứu và Phát triển',
    roleCode: 'RD',
  },
  {
    prefix: 'BOOTSTRAP_ACCOUNTING',
    fullName: 'Kế toán',
    roleCode: 'ACCOUNTING',
  },
] as const;

export function readBootstrapAccounts(
  env: NodeJS.ProcessEnv,
): BootstrapAccount[] {
  const accounts: BootstrapAccount[] = [];

  for (const slot of SLOTS) {
    const email = env[`${slot.prefix}_EMAIL`]?.trim().toLowerCase();
    const password = env[`${slot.prefix}_PASSWORD`];
    if (!email && !password) continue;
    if (!email || !password) {
      throw new Error(
        `${slot.prefix}_EMAIL and ${slot.prefix}_PASSWORD must be set together.`,
      );
    }
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error(`${slot.prefix}_EMAIL is not a valid email address.`);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `${slot.prefix}_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }
    accounts.push({
      email,
      password,
      fullName: slot.fullName,
      roleCode: slot.roleCode,
    });
  }

  if (
    new Set(accounts.map((account) => account.email)).size < accounts.length
  ) {
    throw new Error('Bootstrap accounts must use different email addresses.');
  }
  return accounts;
}

/** Creates the user only if the email is free; an existing user is never modified. */
export async function createBootstrapAccount(
  manager: EntityManager,
  account: BootstrapAccount,
  passwordHash: string,
): Promise<boolean> {
  const existing: Array<{ id: string }> = await manager.query(
    `SELECT id FROM users WHERE lower(email) = $1`,
    [account.email],
  );
  if (existing.length > 0) return false;

  const roleRows: Array<{ id: string }> = await manager.query(
    `SELECT id FROM roles WHERE code = $1`,
    [account.roleCode],
  );
  if (roleRows.length === 0) {
    throw new Error(
      `Role code "${account.roleCode}" not found. Run migrations before bootstrapping accounts.`,
    );
  }

  const inserted: Array<{ id: string }> = await manager.query(
    `INSERT INTO users (email, password_hash, full_name, status, must_change_password)
     VALUES ($1, $2, $3, 'active'::record_status, false)
     RETURNING id`,
    [account.email, passwordHash, account.fullName],
  );
  await manager.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES ($1, $2, now())`,
    [inserted[0].id, roleRows[0].id],
  );
  return true;
}

async function main(): Promise<void> {
  const accounts = readBootstrapAccounts(process.env);
  if (accounts.length === 0) {
    console.log('No BOOTSTRAP_* accounts configured; skipping.');
    return;
  }

  await AppDataSource.initialize();
  try {
    for (const account of accounts) {
      const passwordHash = await hashPassword(account.password);
      const created = await AppDataSource.transaction((manager) =>
        createBootstrapAccount(manager, account, passwordHash),
      );
      console.log(
        `${created ? 'Created' : 'Kept existing'} ${account.roleCode} account ${account.email}`,
      );
    }
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Bootstrap default accounts failed:', error.message);
    process.exitCode = 1;
  });
}
