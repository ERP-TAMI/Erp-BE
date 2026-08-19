import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecordStatus } from '../src/common/enums/database.enums';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

const databaseE2e =
  process.env.RUN_DATABASE_E2E === 'true' ? describe : describe.skip;

databaseE2e('BOM Lines database API (e2e)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ids: Record<string, string> = {};
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);

    const [customer] = await dataSource.query(
      'INSERT INTO customers (customer_code, customer_name) VALUES ($1, $2) RETURNING id',
      [`C-${suffix}`.toUpperCase(), `Customer ${suffix}`],
    );
    ids.customer = customer.id;
    const [purchaseOrder] = await dataSource.query(
      `INSERT INTO purchase_orders
       (po_code, customer_id, customer_name_snapshot, received_date)
       VALUES ($1, $2, $3, CURRENT_DATE) RETURNING id`,
      [`PO-${suffix}`.toUpperCase(), ids.customer, `Customer ${suffix}`],
    );
    ids.purchaseOrder = purchaseOrder.id;
    const [product] = await dataSource.query(
      `INSERT INTO purchase_order_products
       (purchase_order_id, product_code, product_name)
       VALUES ($1, $2, $3) RETURNING id`,
      [ids.purchaseOrder, `P-${suffix}`.toUpperCase(), `Product ${suffix}`],
    );
    ids.product = product.id;
    const [color] = await dataSource.query(
      `INSERT INTO purchase_order_product_colors
       (product_id, color_name) VALUES ($1, $2) RETURNING id`,
      [ids.product, `Color ${suffix}`],
    );
    ids.color = color.id;
    const [bom] = await dataSource.query(
      `INSERT INTO bills_of_materials
       (bom_code, product_color_id, product_code_snapshot,
        product_name_snapshot, color_name_snapshot, po_code_snapshot,
        order_quantity_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, 1) RETURNING id`,
      [
        `BOM-${suffix}`.toUpperCase(),
        ids.color,
        `P-${suffix}`.toUpperCase(),
        `Product ${suffix}`,
        `Color ${suffix}`,
        `PO-${suffix}`.toUpperCase(),
      ],
    );
    ids.bom = bom.id;
    const [group] = await dataSource.query(
      `INSERT INTO material_groups (code, name, display_order, status)
       VALUES ($1, $2, 0, 'active') RETURNING id`,
      [`G-${suffix}`.toUpperCase(), `Group ${suffix}`],
    );
    ids.group = group.id;
    const [unit] = await dataSource.query(
      `INSERT INTO units (code, name, decimal_scale, status)
       VALUES ($1, $2, 2, 'active') RETURNING id`,
      [`U-${suffix}`.toUpperCase(), `Unit ${suffix}`],
    );
    ids.unit = unit.id;
    const [material] = await dataSource.query(
      `INSERT INTO materials
       (material_code, material_name, material_group_id, default_unit_id,
        last_unit_cost, status)
       VALUES ($1, $2, $3, $4, 12.5, 'active') RETURNING id`,
      [`M-${suffix}`.toUpperCase(), `Material ${suffix}`, ids.group, ids.unit],
    );
    ids.material = material.id;
  }, 30000);

  afterAll(async () => {
    if (ids.bom)
      await dataSource.query('DELETE FROM bills_of_materials WHERE id = $1', [
        ids.bom,
      ]);
    if (ids.material)
      await dataSource.query('DELETE FROM materials WHERE id = $1', [
        ids.material,
      ]);
    if (ids.group)
      await dataSource.query('DELETE FROM material_groups WHERE id = $1', [
        ids.group,
      ]);
    if (ids.unit)
      await dataSource.query('DELETE FROM units WHERE id = $1', [ids.unit]);
    if (ids.color)
      await dataSource.query(
        'DELETE FROM purchase_order_product_colors WHERE id = $1',
        [ids.color],
      );
    if (ids.product)
      await dataSource.query(
        'DELETE FROM purchase_order_products WHERE id = $1',
        [ids.product],
      );
    if (ids.purchaseOrder)
      await dataSource.query('DELETE FROM purchase_orders WHERE id = $1', [
        ids.purchaseOrder,
      ]);
    if (ids.customer)
      await dataSource.query('DELETE FROM customers WHERE id = $1', [
        ids.customer,
      ]);
    await app.close();
  });

  it('adds only active materials and preserves historical snapshots', async () => {
    const created = await request(app.getHttpServer())
      .post(`/boms/${ids.bom}/lines`)
      .send({
        materialId: ids.material,
        consumptionPerUnit: 1.25,
        orderIndex: 0,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      materialNameSnapshot: `Material ${suffix}`,
      materialGroupSnapshot: `Group ${suffix}`,
      unitSnapshot: `Unit ${suffix}`,
      unitCost: 12.5,
    });

    await request(app.getHttpServer())
      .patch(`/masters/materials/${ids.material}/status`)
      .send({ status: RecordStatus.INACTIVE })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/boms/${ids.bom}/lines`)
      .send({
        materialId: ids.material,
        consumptionPerUnit: 1,
        orderIndex: 1,
      })
      .expect(409);

    const lines = await request(app.getHttpServer())
      .get(`/boms/${ids.bom}/lines`)
      .expect(200);
    expect(lines.body).toEqual([
      expect.objectContaining({
        materialNameSnapshot: `Material ${suffix}`,
        materialGroupSnapshot: `Group ${suffix}`,
        unitSnapshot: `Unit ${suffix}`,
      }),
    ]);
  });
});
