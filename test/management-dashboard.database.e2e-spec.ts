import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';

type SummaryResponse = {
  month: string;
  totalPurchaseOrders: number;
  completedPurchaseOrders: number;
  overduePurchaseOrders: number;
  activeEmployees: number;
};

describe('Management dashboard API with PostgreSQL (e2e)', () => {
  const runKey = `TST-DASH-${process.pid}`;
  const month = '2026-09';
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
    await cleanupTestRows();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await cleanupTestRows();
    if (app) await app.close();
  });

  async function cleanupTestRows(): Promise<void> {
    await dataSource.query(
      `
        DELETE FROM purchase_order_products
        WHERE purchase_order_id IN (
          SELECT id FROM purchase_orders WHERE po_code LIKE $1
        )
      `,
      [`${runKey}%`],
    );
    await dataSource.query(
      `DELETE FROM purchase_orders WHERE po_code LIKE $1`,
      [`${runKey}%`],
    );
    await dataSource.query(
      `DELETE FROM customers WHERE customer_code LIKE $1`,
      [`${runKey}%`],
    );
    await dataSource.query(`DELETE FROM users WHERE email LIKE $1`, [
      `${runKey.toLowerCase()}%@tami.test`,
    ]);
  }

  async function getSummary(): Promise<SummaryResponse> {
    const response = await request(app.getHttpServer())
      .get(`/management/dashboard/summary?month=${month}`)
      .expect(200);
    return response.body as SummaryResponse;
  }

  it.each([
    ['pending setup', true, false, null, 0],
    ['manually locked', false, true, null, 0],
    ['temporarily locked', false, false, '1 hour', 0],
    ['expired lockout', false, false, '-1 hour', 1],
    ['active', false, false, null, 1],
  ])(
    'counts %s accounts consistently with Active user management',
    async (label, pending, locked, lockout, expected) => {
      const baseline = await getSummary();
      await dataSource.query(
        `INSERT INTO users (email, password_hash, full_name, status, must_change_password, manually_locked_at, lockout_until)
       VALUES ($1, 'test-only', $2, 'active', $3, CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END,
         CASE WHEN $5::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + $5::interval END)`,
        [
          `${runKey.toLowerCase()}-state-${String(label).replace(/ /g, '-')}@tami.test`,
          label,
          pending,
          locked,
          lockout,
        ],
      );
      const summary = await getSummary();
      expect(summary.activeEmployees).toBe(
        baseline.activeEmployees + Number(expected),
      );
    },
  );

  it('counts overdue POs by the PO deadline, including orders without products', async () => {
    const baseline = await getSummary();
    const [{ id: customerId }] = (await dataSource.query(
      `
        INSERT INTO customers (customer_code, customer_name)
        VALUES ($1, $2)
        RETURNING id
      `,
      [`${runKey}-CUSTOMER`, `${runKey} Customer`],
    )) as Array<{ id: string }>;

    await dataSource.query(
      `
        INSERT INTO users (email, password_hash, full_name, status, must_change_password)
        VALUES
          ($1, 'test-only', $2, 'active', false),
          ($3, 'test-only', $4, 'inactive', false)
      `,
      [
        `${runKey.toLowerCase()}-active@tami.test`,
        `${runKey} Active`,
        `${runKey.toLowerCase()}-inactive@tami.test`,
        `${runKey} Inactive`,
      ],
    );

    const purchaseOrders = (await dataSource.query(
      `
        INSERT INTO purchase_orders (
          po_code,
          customer_id,
          customer_name_snapshot,
          received_date,
          deadline,
          status,
          cancellation_reason,
          closed_at,
          archived_at
        )
        VALUES
          ($1, $8, $9, '2026-09-01', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 2, 'closed', NULL, now(), NULL),
          ($2, $8, $9, '2026-09-08', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 2, 'cancelled', 'Test cancellation', NULL, NULL),
          ($3, $8, $9, '2026-09-15', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'in_progress', NULL, NULL, NULL),
          ($4, $8, $9, '2026-09-20', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'pending_rd', NULL, NULL, NULL),
          ($5, $8, $9, '2026-10-01', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'in_progress', NULL, NULL, NULL),
          ($6, $8, $9, '2026-09-10', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'in_progress', NULL, NULL, now()),
          ($7, $8, $9, '2026-09-22', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'draft', NULL, NULL, NULL)
        RETURNING id, po_code
      `,
      [
        `${runKey}-CLOSED`,
        `${runKey}-CANCELLED`,
        `${runKey}-OVERDUE`,
        `${runKey}-TODAY`,
        `${runKey}-NEXT-MONTH`,
        `${runKey}-ARCHIVED`,
        `${runKey}-EMPTY-OVERDUE`,
        customerId,
        `${runKey} Customer`,
      ],
    )) as Array<{ id: string; po_code: string }>;
    const overduePoId = purchaseOrders.find((po) =>
      po.po_code.endsWith('-OVERDUE'),
    )?.id;
    const todayPoId = purchaseOrders.find((po) =>
      po.po_code.endsWith('-TODAY'),
    )?.id;

    await dataSource.query(
      `
        INSERT INTO purchase_order_products (
          purchase_order_id,
          product_code,
          product_name,
          deadline,
          status
        )
        VALUES
          ($1, 'OVERDUE-1', 'Overdue one', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'sampling'),
          ($1, 'OVERDUE-2', 'Overdue two', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 2, 'sampling'),
          ($2, 'DUE-TODAY', 'Due today', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'sampling')
      `,
      [overduePoId, todayPoId],
    );

    await expect(getSummary()).resolves.toEqual({
      month,
      totalPurchaseOrders: baseline.totalPurchaseOrders + 5,
      completedPurchaseOrders: baseline.completedPurchaseOrders + 1,
      overduePurchaseOrders: baseline.overduePurchaseOrders + 2,
      activeEmployees: baseline.activeEmployees + 1,
    });
  });
});
