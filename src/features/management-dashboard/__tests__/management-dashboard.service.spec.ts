import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ManagementDashboardService } from '../management-dashboard.service';

describe('ManagementDashboardService', () => {
  let dataSource: jest.Mocked<Pick<DataSource, 'query'>>;
  let service: ManagementDashboardService;

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
    };
    service = new ManagementDashboardService(
      dataSource as unknown as DataSource,
    );
  });

  it('returns operational KPIs and chart data using product deadlines and HCM dates', async () => {
    dataSource.query.mockResolvedValue([
      {
        total_purchase_orders: '12',
        completed_purchase_orders: '5',
        cancelled_purchase_orders: '2',
        processing_purchase_orders: '18',
        overdue_product_purchase_orders: '3',
        upcoming_product_purchase_orders: '4',
        pending_boms: '7',
        active_employees: '24',
        trend: [],
        purchase_order_statuses: [],
        bom_revision_statuses: [],
        top_customers: [],
        overdue_queue: [],
        upcoming_queue: [],
        pending_bom_queue: [],
      },
    ]);

    await expect(
      service.getSummary({ periodType: 'month', month: '2026-09' }),
    ).resolves.toEqual({
      periodType: 'month',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      trendGranularity: 'day',
      totalPurchaseOrders: 12,
      completedPurchaseOrders: 5,
      cancelledPurchaseOrders: 2,
      processingPurchaseOrders: 18,
      overdueProductPurchaseOrders: 3,
      upcomingProductPurchaseOrders: 4,
      pendingBomCount: 7,
      activeEmployees: 24,
      trend: [],
      purchaseOrderStatuses: [],
      bomRevisionStatuses: [],
      topCustomers: [],
      overdueQueue: [],
      upcomingQueue: [],
      pendingBomQueue: [],
    });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(*) FILTER'),
      ['2026-09-01', '2026-10-01', 'day'],
    );

    const sql = dataSource.query.mock.calls[0][0] as string;
    expect(sql).toContain('purchase_order.archived_at IS NULL');
    expect(sql).toContain("selected_purchase_order.status = 'closed'");
    expect(sql).toContain("selected_purchase_order.status <> 'cancelled'");
    expect(sql).toContain(
      "purchase_order.status NOT IN ('closed', 'cancelled')",
    );
    expect(sql).toContain("product.status NOT IN ('closed', 'cancelled')");
    expect(sql).toContain('product.deadline < date_context.today');
    expect(sql).toContain('product.deadline <= date_context.today + 6');
    expect(sql).toContain('COUNT(DISTINCT');
    expect(sql).toContain('purchase_order_products');
    expect(sql).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain('bom.discontinued_at IS NULL');
    expect(sql).toContain('bom.current_revision_id = revision.id');
    expect(sql).toContain('generate_series');
    expect(sql).toContain("user_account.status = 'active'");
    expect(sql).toContain('must_change_password = false');
    expect(sql).toContain('manually_locked_at IS NULL');
    expect(sql).toContain(
      'user_account.lockout_until IS NULL OR user_account.lockout_until <= CURRENT_TIMESTAMP',
    );
  });

  it('calculates the next month correctly across a year boundary', async () => {
    dataSource.query.mockResolvedValue([
      {
        total_purchase_orders: 0,
        completed_purchase_orders: 0,
        cancelled_purchase_orders: 0,
        processing_purchase_orders: 0,
        overdue_product_purchase_orders: 0,
        upcoming_product_purchase_orders: 0,
        pending_boms: 0,
        active_employees: 0,
        trend: [],
        purchase_order_statuses: [],
        bom_revision_statuses: [],
        top_customers: [],
        overdue_queue: [],
        upcoming_queue: [],
        pending_bom_queue: [],
      },
    ]);

    await service.getSummary({ periodType: 'month', month: '2026-12' });

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      '2026-12-01',
      '2027-01-01',
      'day',
    ]);
  });

  it('uses database-wide event bounds for the all-time period', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        { period_start: '2020-01-15', period_end: '2026-09-30' },
      ])
      .mockResolvedValueOnce([
        {
          total_purchase_orders: '0',
          completed_purchase_orders: '0',
          cancelled_purchase_orders: '0',
          processing_purchase_orders: '0',
          overdue_product_purchase_orders: '0',
          upcoming_product_purchase_orders: '0',
          pending_boms: '0',
          active_employees: '0',
          trend: [],
          purchase_order_statuses: [],
          bom_revision_statuses: [],
          top_customers: [],
          overdue_queue: [],
          upcoming_queue: [],
          pending_bom_queue: [],
        },
      ]);

    await expect(
      service.getSummary({ periodType: 'all' }),
    ).resolves.toMatchObject({
      periodType: 'all',
      periodStart: '2020-01-15',
      periodEnd: '2026-09-30',
      trendGranularity: 'year',
    });

    const [boundsSql] = dataSource.query.mock.calls[0];
    expect(boundsSql).toContain('FROM purchase_orders');
    expect(boundsSql).toContain('FROM boms AS bom');
    expect(boundsSql).toContain('FROM users AS user_account');
    expect(boundsSql).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'purchase_order.received_date < date_context.period_end_exclusive',
      ),
      ['2020-01-15', '2026-10-01', 'year'],
    );
  });

  it('uses the full calendar year for annual KPIs and monthly trend buckets', async () => {
    dataSource.query.mockResolvedValue([
      {
        total_purchase_orders: '0',
        completed_purchase_orders: '0',
        cancelled_purchase_orders: '0',
        processing_purchase_orders: '0',
        overdue_product_purchase_orders: '0',
        upcoming_product_purchase_orders: '0',
        pending_boms: '0',
        active_employees: '0',
        trend: [],
        purchase_order_statuses: [],
        bom_revision_statuses: [],
        top_customers: [],
        overdue_queue: [],
        upcoming_queue: [],
        pending_bom_queue: [],
      },
    ]);

    await expect(
      service.getSummary({ periodType: 'year', year: '2024' }),
    ).resolves.toMatchObject({
      periodType: 'year',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      trendGranularity: 'month',
    });
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      '2024-01-01',
      '2025-01-01',
      'month',
    ]);
  });

  it('includes both endpoints in a date-range query, including leap day', async () => {
    dataSource.query.mockResolvedValue([
      {
        total_purchase_orders: '0',
        completed_purchase_orders: '0',
        cancelled_purchase_orders: '0',
        processing_purchase_orders: '0',
        overdue_product_purchase_orders: '0',
        upcoming_product_purchase_orders: '0',
        pending_boms: '0',
        active_employees: '0',
        trend: [],
        purchase_order_statuses: [],
        bom_revision_statuses: [],
        top_customers: [],
        overdue_queue: [],
        pending_bom_queue: [],
      },
    ]);

    await expect(
      service.getBusinessSummary({
        periodType: 'range',
        fromDate: '2024-02-28',
        toDate: '2024-03-01',
      }),
    ).resolves.toMatchObject({
      periodType: 'range',
      periodStart: '2024-02-28',
      periodEnd: '2024-03-01',
      trendGranularity: 'day',
    });
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      '2024-02-28',
      '2024-03-02',
      'day',
    ]);
  });

  it('rejects an invalid range before running the dashboard query', async () => {
    await expect(
      service.getSummary({
        periodType: 'range',
        fromDate: '2024-03-02',
        toDate: '2024-03-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('omits the employee KPI from the business dashboard response', async () => {
    dataSource.query.mockResolvedValue([
      {
        total_purchase_orders: '1',
        completed_purchase_orders: '0',
        cancelled_purchase_orders: '0',
        processing_purchase_orders: '1',
        overdue_product_purchase_orders: '0',
        upcoming_product_purchase_orders: '0',
        pending_boms: '0',
        active_employees: '24',
        trend: [],
        purchase_order_statuses: [],
        bom_revision_statuses: [],
        top_customers: [],
        overdue_queue: [],
        upcoming_queue: [],
        pending_bom_queue: [],
      },
    ]);

    const summary = await service.getBusinessSummary({
      periodType: 'month',
      month: '2026-09',
    });

    expect(summary).not.toHaveProperty('activeEmployees');
    expect(summary.totalPurchaseOrders).toBe(1);
  });

  it('returns management statuses and deadline days using the Vietnam business date', async () => {
    const items = [
      {
        id: 'po-overdue',
        poCode: 'PO-OVERDUE',
        customerNameSnapshot: 'Khách hàng A',
        receivedDate: '2026-09-01',
        deadline: '2026-09-25',
        status: 'in_progress',
        managementStatus: 'overdue',
        daysToDeadline: -2,
      },
      {
        id: 'po-completed',
        poCode: 'PO-COMPLETED',
        customerNameSnapshot: 'Khách hàng B',
        receivedDate: '2026-09-02',
        deadline: '2026-09-20',
        status: 'closed',
        managementStatus: 'completed',
        daysToDeadline: -7,
      },
      {
        id: 'po-cancelled',
        poCode: 'PO-CANCELLED',
        customerNameSnapshot: 'Khách hàng C',
        receivedDate: '2026-09-03',
        deadline: '2026-09-18',
        status: 'cancelled',
        managementStatus: 'cancelled',
        daysToDeadline: -9,
      },
      {
        id: 'po-not-completed',
        poCode: 'PO-NOT-COMPLETED',
        customerNameSnapshot: 'Khách hàng D',
        receivedDate: '2026-09-04',
        deadline: '2026-09-27',
        status: 'draft',
        managementStatus: 'not_completed',
        daysToDeadline: 0,
      },
    ];
    dataSource.query.mockResolvedValue([
      {
        total_purchase_orders: '14',
        overdue_purchase_orders: '1',
        upcoming_purchase_orders: '0',
        items,
      },
    ]);

    await expect(
      service.getPurchaseOrdersOverview({
        month: '2026-09',
        page: 2,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      totalPurchaseOrders: 14,
      overduePurchaseOrders: 1,
      upcomingPurchaseOrders: 0,
      items,
      meta: { total: 14, page: 2, limit: 10, totalPages: 2 },
    });

    const [sql, parameters] = dataSource.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    const cancelledIndex = sql.indexOf(
      "WHEN purchase_order.status = 'cancelled' THEN 'cancelled'",
    );
    const completedIndex = sql.indexOf(
      "WHEN purchase_order.status = 'closed' THEN 'completed'",
    );
    const overdueIndex = sql.indexOf(
      "WHEN purchase_order.deadline < date_context.today THEN 'overdue'",
    );

    expect(cancelledIndex).toBeGreaterThanOrEqual(0);
    expect(cancelledIndex).toBeLessThan(completedIndex);
    expect(completedIndex).toBeLessThan(overdueIndex);
    expect(sql).toContain(
      'purchase_order.deadline - date_context.today AS days_to_deadline',
    );
    expect(sql).toContain("'managementStatus', page_item.management_status");
    expect(sql).toContain("'daysToDeadline', page_item.days_to_deadline");
    expect(sql).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain(
      "selected_purchase_order.management_status = 'overdue'",
    );
    expect(sql).toContain(
      "selected_purchase_order.management_status = 'not_completed'",
    );
    expect(sql).toContain('selected_purchase_order.days_to_deadline < 7');
    expect(parameters).toEqual(['2026-10-01', '2026-09-01', 10, 10]);
  });

  it('rejects an unsafe computed offset before issuing SQL', async () => {
    await expect(
      service.getPurchaseOrdersOverview({
        month: '2026-09',
        page: Number.MAX_SAFE_INTEGER,
        limit: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
