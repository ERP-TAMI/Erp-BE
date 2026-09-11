import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

/**
 * Demo PO based on a real Cameron Industries garment purchase order
 * (SP 26 41075), with a second invented product added so the seed always
 * covers 2 products x colors x sizes for teammates building other features
 * (production docs, sample rounds, size tables, ...).
 */

export type PoProductSizeSeed = { sizeLabel: string; quantity: number };
export type PoProductColorSeed = {
  colorName: string;
  colorCode: string;
  sizes: PoProductSizeSeed[];
};
export type PoProductSeed = {
  productCode: string;
  productName: string;
  category: string;
  materialNote: string;
  colors: PoProductColorSeed[];
};
export type PoSeed = {
  poCode: string;
  customerPoCode: string;
  customerNameSnapshot: string;
  receivedDate: string;
  deadline: string;
  note: string;
  products: PoProductSeed[];
};

export const PO_DEMO_SEED: PoSeed = {
  poCode: 'SP26-41075',
  customerPoCode: '10015809',
  customerNameSnapshot: 'Cameron Industries Inc',
  receivedDate: '2026-02-13',
  deadline: '2026-04-25',
  note: "End Cust/PO: Macy's Backstage · Season F26 · Ship mode: Boat-DNLA · Factory: Tan Minh Textile Sewing",
  products: [
    {
      productCode: '7918B293MB',
      productName: 'Pull On Flare Pants',
      category: 'Quần',
      materialNote:
        '95% Polyester, 5% Spandex — vải Coachella, định mức 1.35 yds/sp. Pull on flare, patch pockets, tab w/ rivets.',
      colors: [
        {
          colorName: 'Dk Chocolate',
          colorCode: '#4B3221',
          sizes: [
            { sizeLabel: 'S', quantity: 100 },
            { sizeLabel: 'M', quantity: 200 },
            { sizeLabel: 'L', quantity: 200 },
            { sizeLabel: 'XL', quantity: 100 },
          ],
        },
      ],
    },
    {
      productCode: '7918T110MB',
      productName: 'Ribbed Tank Top',
      category: 'Áo',
      materialNote:
        '95% Cotton, 5% Spandex — dệt kim ribbed, form ôm nhẹ, phối cùng quần 7918B293MB.',
      colors: [
        {
          colorName: 'Ivory',
          colorCode: '#F2EDE1',
          sizes: [
            { sizeLabel: 'S', quantity: 80 },
            { sizeLabel: 'M', quantity: 120 },
            { sizeLabel: 'L', quantity: 120 },
            { sizeLabel: 'XL', quantity: 80 },
          ],
        },
        {
          colorName: 'Black',
          colorCode: '#1B1B1B',
          sizes: [
            { sizeLabel: 'S', quantity: 80 },
            { sizeLabel: 'M', quantity: 120 },
            { sizeLabel: 'L', quantity: 120 },
            { sizeLabel: 'XL', quantity: 80 },
          ],
        },
      ],
    },
  ],
};

async function upsertPo(manager: EntityManager, seed: PoSeed): Promise<string> {
  const inserted = await manager.query(
    `INSERT INTO purchase_orders
       (po_code, customer_po_code, customer_name_snapshot, received_date, deadline, note, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_progress'::po_status)
     ON CONFLICT (po_code) DO NOTHING
     RETURNING id`,
    [
      seed.poCode,
      seed.customerPoCode,
      seed.customerNameSnapshot,
      seed.receivedDate,
      seed.deadline,
      seed.note,
    ],
  );
  if (inserted.length > 0) return inserted[0].id as string;

  const existing = await manager.query(
    `SELECT id FROM purchase_orders WHERE po_code = $1`,
    [seed.poCode],
  );
  return existing[0].id as string;
}

async function upsertProduct(
  manager: EntityManager,
  poId: string,
  seed: PoProductSeed,
): Promise<string> {
  const inserted = await manager.query(
    `INSERT INTO purchase_order_products
       (purchase_order_id, product_code, product_name, category, material_note, deadline, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_review'::product_status)
     ON CONFLICT (purchase_order_id, product_code) DO NOTHING
     RETURNING id`,
    [
      poId,
      seed.productCode,
      seed.productName,
      seed.category,
      seed.materialNote,
      PO_DEMO_SEED.deadline,
    ],
  );
  if (inserted.length > 0) return inserted[0].id as string;

  const existing = await manager.query(
    `SELECT id FROM purchase_order_products WHERE purchase_order_id = $1 AND product_code = $2`,
    [poId, seed.productCode],
  );
  return existing[0].id as string;
}

async function upsertColor(
  manager: EntityManager,
  productId: string,
  seed: PoProductColorSeed,
  orderIndex: number,
): Promise<string> {
  const inserted = await manager.query(
    `INSERT INTO purchase_order_product_colors
       (product_id, color_name, color_code, order_index)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id, color_name) DO NOTHING
     RETURNING id`,
    [productId, seed.colorName, seed.colorCode, orderIndex],
  );
  if (inserted.length > 0) return inserted[0].id as string;

  const existing = await manager.query(
    `SELECT id FROM purchase_order_product_colors WHERE product_id = $1 AND color_name = $2`,
    [productId, seed.colorName],
  );
  return existing[0].id as string;
}

async function upsertSize(
  manager: EntityManager,
  colorId: string,
  seed: PoProductSizeSeed,
  orderIndex: number,
): Promise<void> {
  await manager.query(
    `INSERT INTO purchase_order_product_color_sizes
       (product_color_id, size_label, quantity, order_index)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_color_id, size_label) DO UPDATE
     SET quantity = EXCLUDED.quantity`,
    [colorId, seed.sizeLabel, seed.quantity, orderIndex],
  );
}

async function ensureCreatedHistory(
  manager: EntityManager,
  productId: string,
): Promise<void> {
  const existing = await manager.query(
    `SELECT id FROM purchase_order_product_status_history WHERE product_id = $1 LIMIT 1`,
    [productId],
  );
  if (existing.length > 0) return;

  await manager.query(
    `INSERT INTO purchase_order_product_status_history
       (product_id, new_status, action, reason)
     VALUES ($1, 'in_review'::product_status, 'created', 'Seed demo data')`,
    [productId],
  );
}

export async function seedPoDemo(manager: EntityManager): Promise<void> {
  const poId = await upsertPo(manager, PO_DEMO_SEED);

  for (const productSeed of PO_DEMO_SEED.products) {
    const productId = await upsertProduct(manager, poId, productSeed);

    for (let cIdx = 0; cIdx < productSeed.colors.length; cIdx++) {
      const colorSeed = productSeed.colors[cIdx];
      const colorId = await upsertColor(manager, productId, colorSeed, cIdx);

      for (let sIdx = 0; sIdx < colorSeed.sizes.length; sIdx++) {
        await upsertSize(manager, colorId, colorSeed.sizes[sIdx], sIdx);
      }
    }

    await ensureCreatedHistory(manager, productId);
  }
}

export async function seedPoDemoCatalog(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(seedPoDemo);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await seedPoDemoCatalog(AppDataSource);
    console.log(
      `Seeded demo PO "${PO_DEMO_SEED.poCode}" with ${PO_DEMO_SEED.products.length} product(s).`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed PO demo failed:', error);
    process.exitCode = 1;
  });
}
