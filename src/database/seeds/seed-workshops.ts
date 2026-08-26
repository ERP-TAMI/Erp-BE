import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

export type WorkshopSeed = {
  workshopCode: string;
  name: string;
  manager: string;
  location: string;
  capacity: number;
};

export const WORKSHOP_SEEDS: readonly WorkshopSeed[] = [
  {
    workshopCode: 'BM-01',
    name: 'Xưởng May Bình Minh 1',
    manager: 'Phạm Hoàng Nam',
    location: 'Phân khu A - KCN Sài Đồng, Long Biên',
    capacity: 1200,
  },
];

export async function seedWorkshops(manager: EntityManager): Promise<void> {
  for (const w of WORKSHOP_SEEDS) {
    await manager.query(
      `INSERT INTO workshops (workshop_code, name, manager, location, daily_capacity, status)
       VALUES ($1, $2, $3, $4, $5, 'active'::record_status)
       ON CONFLICT (workshop_code) DO UPDATE
       SET name = EXCLUDED.name,
           manager = EXCLUDED.manager,
           location = EXCLUDED.location,
           daily_capacity = EXCLUDED.daily_capacity,
           status = 'active'::record_status`,
      [w.workshopCode, w.name, w.manager, w.location, w.capacity],
    );
  }
}

export async function seedWorkshopCatalog(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.transaction(seedWorkshops);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await seedWorkshopCatalog(AppDataSource);
    console.log(`Successfully seeded ${WORKSHOP_SEEDS.length} workshop(s).`);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed workshops failed:', error);
    process.exitCode = 1;
  });
}
