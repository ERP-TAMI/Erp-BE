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

type PurchaseOrdersOverviewResponse = {
  month: string;
  totalPurchaseOrders: number;
  overduePurchaseOrders: number;
  upcomingPurchaseOrders: number;
  items: Array<{
    poCode: string;
    receivedDate: string;
    deadline: string;
    status: string;
    managementStatus: string;
    daysToDeadline: number;
  }>;
  meta: { total: number; page: number; limit: number; totalPages: number };
};

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function nextMonthStart(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
}

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

  async function getOverview(
    selectedMonth: string,
    page = 1,
    limit = 100,
  ): Promise<PurchaseOrdersOverviewResponse> {
    const response = await request(app.getHttpServer())
      .get(
        `/management/dashboard/purchase-orders?month=${selectedMonth}&page=${page}&limit=${limit}`,
      )
      .expect(200);
    return response.body as PurchaseOrdersOverviewResponse;
  }

  it('queries real PostgreSQL rows for overlap boundaries, deadline buckets, statuses, and pagination', async () => {
    const [{ today }] = (await dataSource.query(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today`,
    )) as Array<{ today: string }>;
    const currentMonth = today.slice(0, 7);
    const selectedMonth =
      today === `${currentMonth}-01`
        ? shiftDate(today, -1).slice(0, 7)
        : currentMonth;
    const overviewKey = `${runKey}-OVERVIEW`;
    const monthStart = `${selectedMonth}-01`;
    const startOfNextMonth = nextMonthStart(selectedMonth);
    const overdueDeadline = shiftDate(today, -1);
    const beforeMonthDeadline = shiftDate(monthStart, -1);
    const beforeMonthReceived = shiftDate(monthStart, -3);
    const afterMonthReceived = startOfNextMonth;
    const fixtures = [
      {
        suffix: 'CROSS-START',
        receivedDate: beforeMonthReceived,
        deadline: monthStart,
        status: 'closed',
        archived: false,
      },
      {
        suffix: 'RECEIVED-LAST-DAY',
        receivedDate: shiftDate(startOfNextMonth, -1),
        deadline: startOfNextMonth,
        status: 'closed',
        archived: false,
      },
      {
        suffix: 'OVERDUE',
        receivedDate: monthStart,
        deadline: overdueDeadline,
        status: 'in_progress',
        archived: false,
      },
      {
        suffix: 'DUE-TODAY',
        receivedDate: monthStart,
        deadline: today,
        status: 'in_progress',
        archived: false,
      },
      {
        suffix: 'DUE-IN-SIX',
        receivedDate: monthStart,
        deadline: shiftDate(today, 6),
        status: 'pending_rd',
        archived: false,
      },
      {
        suffix: 'DUE-IN-SEVEN',
        receivedDate: monthStart,
        deadline: shiftDate(today, 7),
        status: 'draft',
        archived: false,
      },
      {
        suffix: 'CLOSED-PAST',
        receivedDate: monthStart,
        deadline: overdueDeadline,
        status: 'closed',
        archived: false,
      },
      {
        suffix: 'CANCELLED-PAST',
        receivedDate: monthStart,
        deadline: overdueDeadline,
        status: 'cancelled',
        archived: false,
      },
      {
        suffix: 'ARCHIVED-OVERDUE',
        receivedDate: monthStart,
        deadline: overdueDeadline,
        status: 'in_progress',
        archived: true,
      },
      {
        suffix: 'DEADLINE-BEFORE-MONTH',
        receivedDate: beforeMonthReceived,
        deadline: beforeMonthDeadline,
        status: 'in_progress',
        archived: false,
      },
      {
        suffix: 'RECEIVED-AFTER-MONTH',
        receivedDate: afterMonthReceived,
        deadline: shiftDate(afterMonthReceived, 2),
        status: 'in_progress',
        archived: false,
      },
    ];
    const before = await getOverview(selectedMonth);
    const [{ id: customerId }] = (await dataSource.query(
      `
        INSERT INTO customers (customer_code, customer_name)
        VALUES ($1, $2)
        RETURNING id
      `,
      [`${runKey}-OVERVIEW-CUSTOMER`, `${runKey} Overview Customer`],
    )) as Array<{ id: string }>;
    const values: unknown[] = [];
    const valueSql = fixtures.map((fixture, index) => {
      const base = index * 9;
      values.push(
        `${overviewKey}-${fixture.suffix}`,
        customerId,
        `${overviewKey} Customer`,
        fixture.receivedDate,
        fixture.deadline,
        fixture.status,
        fixture.status === 'cancelled' ? 'Test cancellation' : null,
        fixture.status === 'closed',
        fixture.archived,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}::date, $${base + 6}::po_status, $${base + 7}, CASE WHEN $${base + 8} THEN now() ELSE NULL END, CASE WHEN $${base + 9} THEN now() ELSE NULL END)`;
    });

    await dataSource.query(
      `
        INSERT INTO purchase_orders (
          po_code, customer_id, customer_name_snapshot, received_date, deadline,
          status, cancellation_reason, closed_at, archived_at
        ) VALUES ${valueSql.join(', ')}
      `,
      values,
    );

    const result = await getOverview(selectedMonth);
    const includedFixtureCount = 8;
    expect(result.totalPurchaseOrders).toBe(
      before.totalPurchaseOrders + includedFixtureCount,
    );
    expect(result.overduePurchaseOrders).toBe(before.overduePurchaseOrders + 1);
    expect(result.upcomingPurchaseOrders).toBe(
      before.upcomingPurchaseOrders + 2,
    );

    const allItems = [...result.items];
    for (let page = 2; page <= result.meta.totalPages; page += 1) {
      const pageResult = await getOverview(selectedMonth, page);
      expect(pageResult.meta).toEqual({
        total: result.totalPurchaseOrders,
        page,
        limit: 100,
        totalPages: result.meta.totalPages,
      });
      allItems.push(...pageResult.items);
    }
    expect(allItems).toHaveLength(result.meta.total);
    expect(result.meta).toEqual({
      total: result.totalPurchaseOrders,
      page: 1,
      limit: 100,
      totalPages: Math.max(1, Math.ceil(result.totalPurchaseOrders / 100)),
    });
    const itemsByCode = new Map(allItems.map((item) => [item.poCode, item]));
    for (const fixture of fixtures) {
      const item = itemsByCode.get(`${overviewKey}-${fixture.suffix}`);
      const shouldBeIncluded =
        fixture.receivedDate < startOfNextMonth &&
        fixture.deadline >= monthStart &&
        !fixture.archived;
      expect(Boolean(item)).toBe(shouldBeIncluded);
    }
    expect(itemsByCode.get(`${overviewKey}-CROSS-START`)).toMatchObject({
      receivedDate: beforeMonthReceived,
      deadline: monthStart,
      managementStatus: 'completed',
    });
    expect(itemsByCode.get(`${overviewKey}-RECEIVED-LAST-DAY`)).toMatchObject({
      receivedDate: shiftDate(startOfNextMonth, -1),
      deadline: startOfNextMonth,
      managementStatus: 'completed',
    });
    expect(itemsByCode.get(`${overviewKey}-DUE-TODAY`)).toMatchObject({
      managementStatus: 'not_completed',
      daysToDeadline: 0,
    });
    expect(itemsByCode.get(`${overviewKey}-DUE-IN-SIX`)).toMatchObject({
      managementStatus: 'not_completed',
      daysToDeadline: 6,
    });
    expect(itemsByCode.get(`${overviewKey}-DUE-IN-SEVEN`)).toMatchObject({
      managementStatus: 'not_completed',
      daysToDeadline: 7,
    });
    expect(
      itemsByCode.get(`${overviewKey}-CLOSED-PAST`)?.managementStatus,
    ).toBe('completed');
    expect(
      itemsByCode.get(`${overviewKey}-CANCELLED-PAST`)?.managementStatus,
    ).toBe('cancelled');
    expect(itemsByCode.get(`${overviewKey}-OVERDUE`)).toMatchObject({
      managementStatus: 'overdue',
      daysToDeadline: -1,
    });

    const outOfRangePage = result.meta.totalPages + 3;
    await expect(
      getOverview(selectedMonth, outOfRangePage),
    ).resolves.toMatchObject({
      items: [],
      meta: {
        total: result.totalPurchaseOrders,
        page: outOfRangePage,
        limit: 100,
        totalPages: result.meta.totalPages,
      },
    });

    const [emptyMonthRow] = (await dataSource.query(
      `
        SELECT to_char(candidate.month_start, 'YYYY-MM') AS month
        FROM generate_series(date '2090-01-01', date '2190-12-01', interval '1 month')
          AS candidate(month_start)
        WHERE NOT EXISTS (
          SELECT 1 FROM purchase_orders AS purchase_order
          WHERE purchase_order.archived_at IS NULL
            AND purchase_order.received_date < candidate.month_start + interval '1 month'
            AND purchase_order.deadline >= candidate.month_start
        )
        ORDER BY candidate.month_start
        LIMIT 1
      `,
    )) as Array<{ month: string }>;
    expect(emptyMonthRow).toBeDefined();
    await expect(getOverview(emptyMonthRow.month)).resolves.toMatchObject({
      totalPurchaseOrders: 0,
      overduePurchaseOrders: 0,
      upcomingPurchaseOrders: 0,
      items: [],
      meta: { total: 0, page: 1, limit: 100, totalPages: 1 },
    });
  });

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
