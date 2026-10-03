import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionGuard } from '../src/common/guards/permission.guard';

type SummaryResponse = {
  periodType: 'month' | 'year' | 'range' | 'all';
  periodStart: string;
  periodEnd: string;
  trendGranularity: 'day' | 'month' | 'year';
  totalPurchaseOrders: number;
  completedPurchaseOrders: number;
  cancelledPurchaseOrders: number;
  processingPurchaseOrders: number;
  overdueProductPurchaseOrders: number;
  upcomingProductPurchaseOrders: number;
  pendingBomCount: number;
  activeEmployees: number;
  trend: Array<{ period: string; received: number; completed: number }>;
  comparison: {
    periodStart: string;
    periodEnd: string;
    currentEnd: string;
    trend: Array<{ period: string; received: number | null }>;
  } | null;
  purchaseOrderStatuses: Array<{ status: string; count: number }>;
  bomRevisionStatuses: Array<{ status: string; count: number }>;
  topCustomers: Array<{ customerName: string; count: number }>;
  overdueQueue: Array<{
    purchaseOrderId: string;
    productCount: number;
    deadline: string;
  }>;
  upcomingQueue: Array<{
    purchaseOrderId: string;
    productCount: number;
    deadline: string;
  }>;
  pendingBomQueue: Array<{ bomId: string; status: string }>;
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

function previousYearComparisonEnd(today: string): string {
  const year = Number(today.slice(0, 4));
  const currentYearStart = `${year}-01-01`;
  const previousYearStart = `${year - 1}-01-01`;
  const elapsedDays =
    (Date.parse(`${shiftDate(today, 1)}T00:00:00.000Z`) -
      Date.parse(`${currentYearStart}T00:00:00.000Z`)) /
    (24 * 60 * 60 * 1000);
  const shiftedComparisonEnd = shiftDate(previousYearStart, elapsedDays);
  const comparisonEndExclusive =
    shiftedComparisonEnd < currentYearStart
      ? shiftedComparisonEnd
      : currentYearStart;

  return shiftDate(comparisonEndExclusive, -1);
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
  let authenticatedRole = 'SA';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest<{
            user?: { roleCode: string; permissions: string[] };
          }>();
          request.user = { roleCode: authenticatedRole, permissions: [] };
          return true;
        },
      })
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
      .get(`/management/dashboard/summary?periodType=month&month=${month}`)
      .expect(200);
    return response.body as SummaryResponse;
  }

  async function getYearSummary(year: string): Promise<SummaryResponse> {
    const response = await request(app.getHttpServer())
      .get(`/dashboard/summary?periodType=year&year=${year}`)
      .expect(200);
    return response.body as SummaryResponse;
  }

  it('serves the same operating dashboard to business roles without employee metrics and rejects IT', async () => {
    authenticatedRole = 'NVKH';
    const response = await request(app.getHttpServer())
      .get(`/dashboard/summary?periodType=month&month=${month}`)
      .expect(200);
    const summaryResponse = response.body as SummaryResponse;
    expect(summaryResponse).toMatchObject({
      periodType: 'month',
      periodStart: `${month}-01`,
      periodEnd: '2026-09-30',
      totalPurchaseOrders: expect.any(Number),
      overdueProductPurchaseOrders: expect.any(Number),
      upcomingProductPurchaseOrders: expect.any(Number),
      pendingBomCount: expect.any(Number),
      trendGranularity: 'day',
      trend: expect.any(Array),
    });
    expect(summaryResponse).not.toHaveProperty('activeEmployees');
    expect(summaryResponse.comparison).toMatchObject({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      currentEnd: '2026-09-30',
    });
    expect(summaryResponse.comparison?.trend).toHaveLength(
      summaryResponse.trend.length,
    );
    expect(
      summaryResponse.comparison?.trend.map(({ period }) => period),
    ).toEqual(summaryResponse.trend.map(({ period }) => period));

    authenticatedRole = 'SA';
    const managementResponse = await request(app.getHttpServer())
      .get(`/management/dashboard/summary?periodType=month&month=${month}`)
      .expect(200);
    const managementSummary = managementResponse.body as SummaryResponse;
    expect(managementSummary.comparison).toMatchObject({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      currentEnd: '2026-09-30',
    });
    expect(
      managementSummary.comparison?.trend.map(({ period }) => period),
    ).toEqual(managementSummary.trend.map(({ period }) => period));
    authenticatedRole = 'NVKH';

    await request(app.getHttpServer())
      .get(
        '/dashboard/summary?periodType=range&fromDate=2026-09-05&toDate=2026-09-12',
      )
      .expect(200)
      .expect(({ body }) => {
        const rangeSummary = body as SummaryResponse;
        expect(rangeSummary).toMatchObject({
          periodType: 'range',
          periodStart: '2026-09-05',
          periodEnd: '2026-09-12',
          trendGranularity: 'day',
          comparison: {
            periodStart: '2026-08-28',
            periodEnd: '2026-09-04',
            currentEnd: '2026-09-12',
          },
        });
        expect(
          rangeSummary.comparison?.trend.map(({ period }) => period),
        ).toEqual(rangeSummary.trend.map(({ period }) => period));
      });

    const [{ today }] = (await dataSource.query(
      `SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today`,
    )) as Array<{ today: string }>;
    const currentYear = today.slice(0, 4);

    await request(app.getHttpServer())
      .get(`/dashboard/summary?periodType=year&year=${currentYear}`)
      .expect(200)
      .expect(({ body }) => {
        const yearSummary = body as SummaryResponse;
        expect(yearSummary).toMatchObject({
          periodType: 'year',
          trendGranularity: 'month',
          comparison: {
            periodStart: `${Number(currentYear) - 1}-01-01`,
            periodEnd: previousYearComparisonEnd(today),
            currentEnd: today,
          },
        });
        expect(
          yearSummary.comparison?.trend.map(({ period }) => period),
        ).toEqual(yearSummary.trend.map(({ period }) => period));
      });

    await request(app.getHttpServer())
      .get('/dashboard/summary?periodType=all')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          periodType: 'all',
          trendGranularity: 'year',
          comparison: null,
        });
      });

    await request(app.getHttpServer())
      .get(
        '/dashboard/summary?periodType=range&fromDate=2026-09-12&toDate=2026-09-05',
      )
      .expect(400);

    authenticatedRole = 'IT';
    await request(app.getHttpServer())
      .get(`/dashboard/summary?month=${month}`)
      .expect(403);
    authenticatedRole = 'SA';
  });

  it('excludes future-dated receipts from the current partial month chart bucket', async () => {
    const [{ today }] = (await dataSource.query(
      `SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today`,
    )) as Array<{ today: string }>;
    if (today.endsWith('-12-31')) return;

    const year = today.slice(0, 4);
    const currentMonth = today.slice(0, 7);
    const futureReceivedDate = shiftDate(today, 1);
    const before = await getYearSummary(year);
    const [{ id: customerId }] = (await dataSource.query(
      `
        INSERT INTO customers (customer_code, customer_name)
        VALUES ($1, $2)
        RETURNING id
      `,
      [`${runKey}-FUTURE-CHART-CUSTOMER`, `${runKey} Future Chart Customer`],
    )) as Array<{ id: string }>;

    await dataSource.query(
      `
        INSERT INTO purchase_orders (
          po_code, customer_id, customer_name_snapshot, received_date,
          deadline, status
        )
        VALUES ($1, $2, $3, $4::date, $5::date, 'in_progress')
      `,
      [
        `${runKey}-FUTURE-CHART`,
        customerId,
        `${runKey} Future Chart Customer`,
        futureReceivedDate,
        shiftDate(futureReceivedDate, 7),
      ],
    );

    const after = await getYearSummary(year);
    expect(after.totalPurchaseOrders).toBe(before.totalPurchaseOrders + 1);
    expect(
      after.trend.find(({ period }) => period === currentMonth)?.received,
    ).toBe(
      before.trend.find(({ period }) => period === currentMonth)?.received,
    );
  });

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
        `INSERT INTO users (email, password_hash, full_name, status, must_change_password, manually_locked_at, lockout_until, created_at)
       VALUES ($1, 'test-only', $2, 'active', $3, CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END,
         CASE WHEN $5::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + $5::interval END,
         $6::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
        [
          `${runKey.toLowerCase()}-state-${String(label).replace(/ /g, '-')}@tami.test`,
          label,
          pending,
          locked,
          lockout,
          `${month}-15`,
        ],
      );
      const summary = await getSummary();
      expect(summary.activeEmployees).toBe(
        baseline.activeEmployees + Number(expected),
      );
    },
  );

  it('uses PO deadlines for upcoming alerts including missing product deadlines and the seventh day', async () => {
    const baseline = await getSummary();
    const [{ today }] = await dataSource.query(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today`,
    );
    const cases = [
      { key: 'TODAY', offset: 0, products: [] },
      { key: 'NULL-PRODUCT-DATE', offset: 6, products: [null] },
      { key: 'DAY-SEVEN', offset: 7, products: [14, 15] },
      { key: 'DAY-EIGHT', offset: 8, products: [1] },
      { key: 'PAST', offset: -1, products: [1] },
      { key: 'NO-PO-DATE', offset: null, products: [1] },
      { key: 'CLOSED', offset: 1, products: [1], status: 'closed' },
      { key: 'CANCELLED', offset: 1, products: [1], status: 'cancelled' },
      { key: 'ARCHIVED', offset: 1, products: [1], archived: true },
    ];
    const ids: string[] = [];
    try {
      for (const fixture of cases) {
        const [{ id }] = await dataSource.query(
          `INSERT INTO purchase_orders
            (po_code, customer_name_snapshot, received_date, deadline, status, cancellation_reason, closed_at, archived_at)
           VALUES ($1, 'Dashboard deadline regression', '2026-01-01', $2::date, $3::po_status,
             CASE WHEN $3 = 'cancelled' THEN 'Test cancellation' END,
             CASE WHEN $3 = 'closed' THEN now() END,
             CASE WHEN $4 THEN now() END) RETURNING id`,
          [
            `${runKey}-000-${fixture.key}`,
            fixture.offset === null ? null : shiftDate(today, fixture.offset),
            fixture.status ?? 'in_progress',
            fixture.archived ?? false,
          ],
        );
        ids.push(id);
        for (const [index, offset] of fixture.products.entries()) {
          await dataSource.query(
            `INSERT INTO purchase_order_products (purchase_order_id, product_code, product_name, deadline, status)
             VALUES ($1, $2, 'Dashboard deadline regression', $3::date, 'draft')`,
            [
              id,
              `PRODUCT-${index}`,
              offset === null ? null : shiftDate(today, offset),
            ],
          );
        }
      }
      const result = await getSummary();
      expect(result.upcomingProductPurchaseOrders).toBe(
        baseline.upcomingProductPurchaseOrders + 3,
      );
      expect(result.overdueProductPurchaseOrders).toBe(
        baseline.overdueProductPurchaseOrders,
      );
      expect(result.upcomingQueue).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            purchaseOrderId: ids[0],
            productCount: 0,
            deadline: today,
          }),
        ]),
      );
      // Independently verify the capped queue and its PO deadlines, including ordering.
      const expectedQueue = await dataSource.query(
        `SELECT po.id AS "purchaseOrderId", to_char(po.deadline, 'YYYY-MM-DD') AS deadline,
           (SELECT COUNT(*)::int FROM purchase_order_products p WHERE p.purchase_order_id = po.id AND p.status NOT IN ('closed','cancelled')) AS "productCount"
         FROM purchase_orders po WHERE po.archived_at IS NULL AND po.status NOT IN ('closed','cancelled')
           AND po.deadline BETWEEN $1::date AND $1::date + 7
         ORDER BY po.deadline, po.po_code LIMIT 5`,
        [today],
      );
      expect(
        result.upcomingQueue.map(
          ({ purchaseOrderId, deadline, productCount }) => ({
            purchaseOrderId,
            deadline,
            productCount,
          }),
        ),
      ).toEqual(expectedQueue);
      const business = await request(app.getHttpServer())
        .get('/dashboard/summary?periodType=month&month=2026-12')
        .expect(200);
      expect(business.body.upcomingProductPurchaseOrders).toBe(
        result.upcomingProductPurchaseOrders,
      );
      expect(business.body.upcomingQueue).toEqual(result.upcomingQueue);
    } finally {
      await dataSource.query(
        'DELETE FROM purchase_order_products WHERE purchase_order_id = ANY($1::uuid[])',
        [ids],
      );
      await dataSource.query(
        'DELETE FROM purchase_orders WHERE id = ANY($1::uuid[])',
        [ids],
      );
    }
  });

  it('counts overdue POs by product deadlines and counts a PO once', async () => {
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
        INSERT INTO users (email, password_hash, full_name, status, must_change_password, created_at)
        VALUES
          ($1, 'test-only', $2, 'active', false, $5::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'),
          ($3, 'test-only', $4, 'inactive', false, $5::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      `,
      [
        `${runKey.toLowerCase()}-active@tami.test`,
        `${runKey} Active`,
        `${runKey.toLowerCase()}-inactive@tami.test`,
        `${runKey} Inactive`,
        `${month}-15`,
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
          ($7, $8, $9, '2026-09-22', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'draft', NULL, NULL, NULL),
          ($10, $8, $9, '2026-08-01', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'in_progress', NULL, NULL, NULL),
          ($11, $8, $9, '2026-08-15', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 3, 'in_progress', NULL, NULL, NULL)
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
        `${runKey}-OLD-OVERDUE`,
        `${runKey}-OLD-UPCOMING`,
      ],
    )) as Array<{ id: string; po_code: string }>;
    const overduePoId = purchaseOrders.find((po) =>
      po.po_code.endsWith('-OVERDUE'),
    )?.id;
    const todayPoId = purchaseOrders.find((po) =>
      po.po_code.endsWith('-TODAY'),
    )?.id;
    const oldOverduePoId = purchaseOrders.find((po) =>
      po.po_code.endsWith('-OLD-OVERDUE'),
    )?.id;
    const oldUpcomingPoId = purchaseOrders.find((po) =>
      po.po_code.endsWith('-OLD-UPCOMING'),
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
          ($2, 'DUE-TODAY', 'Due today', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'sampling'),
          ($3, 'OLD-OVERDUE', 'Imported overdue', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1, 'sampling'),
          ($4, 'OLD-UPCOMING', 'Imported upcoming', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 3, 'sampling')
      `,
      [overduePoId, todayPoId, oldOverduePoId, oldUpcomingPoId],
    );

    await expect(getSummary()).resolves.toMatchObject({
      periodType: 'month',
      periodStart: `${month}-01`,
      periodEnd: shiftDate(nextMonthStart(month), -1),
      totalPurchaseOrders: baseline.totalPurchaseOrders + 4,
      completedPurchaseOrders: baseline.completedPurchaseOrders + 1,
      cancelledPurchaseOrders: baseline.cancelledPurchaseOrders + 1,
      processingPurchaseOrders: baseline.processingPurchaseOrders + 3,
      overdueProductPurchaseOrders: baseline.overdueProductPurchaseOrders + 2,
      upcomingProductPurchaseOrders: baseline.upcomingProductPurchaseOrders + 2,
      pendingBomCount: baseline.pendingBomCount,
      activeEmployees: baseline.activeEmployees + 1,
    });
  });
});
