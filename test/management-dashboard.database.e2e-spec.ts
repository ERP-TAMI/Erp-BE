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

  it('counts the monthly PO cohort and current active employees without duplicate overdue POs', async () => {
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
          status,
          cancellation_reason,
          closed_at,
          archived_at
        )
        VALUES
          ($1, $7, $8, '2026-09-01', 'closed', NULL, now(), NULL),
          ($2, $7, $8, '2026-09-08', 'cancelled', 'Test cancellation', NULL, NULL),
          ($3, $7, $8, '2026-09-15', 'in_progress', NULL, NULL, NULL),
          ($4, $7, $8, '2026-09-20', 'pending_rd', NULL, NULL, NULL),
          ($5, $7, $8, '2026-10-01', 'in_progress', NULL, NULL, NULL),
          ($6, $7, $8, '2026-09-10', 'in_progress', NULL, NULL, now())
        RETURNING id, po_code
      `,
      [
        `${runKey}-CLOSED`,
        `${runKey}-CANCELLED`,
        `${runKey}-OVERDUE`,
        `${runKey}-TODAY`,
        `${runKey}-NEXT-MONTH`,
        `${runKey}-ARCHIVED`,
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
      totalPurchaseOrders: baseline.totalPurchaseOrders + 4,
      completedPurchaseOrders: baseline.completedPurchaseOrders + 1,
      overduePurchaseOrders: baseline.overduePurchaseOrders + 1,
      activeEmployees: baseline.activeEmployees + 1,
    });
  });
});
