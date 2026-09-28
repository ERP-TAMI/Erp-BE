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

  it('returns the four dashboard metrics and preserves the selected month', async () => {
    dataSource.query.mockResolvedValue([
      {
        total_purchase_orders: '12',
        completed_purchase_orders: '5',
        overdue_purchase_orders: '3',
        active_employees: '24',
      },
    ]);

    await expect(service.getSummary('2026-09')).resolves.toEqual({
      month: '2026-09',
      totalPurchaseOrders: 12,
      completedPurchaseOrders: 5,
      overduePurchaseOrders: 3,
      activeEmployees: 24,
    });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(*) FILTER'),
      ['2026-09-01', '2026-10-01'],
    );

    const sql = dataSource.query.mock.calls[0][0] as string;
    expect(sql).toContain('purchase_order.archived_at IS NULL');
    expect(sql).toContain("selected_purchase_order.status = 'closed'");
    expect(sql).toContain("status NOT IN ('closed', 'cancelled')");
    expect(sql).toContain('selected_purchase_order.deadline <');
    expect(sql).not.toContain('purchase_order_products');
    expect(sql).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain("WHERE status = 'active'");
    expect(sql).toContain('must_change_password = false');
    expect(sql).toContain('manually_locked_at IS NULL');
    expect(sql).toContain(
      'lockout_until IS NULL OR lockout_until <= CURRENT_TIMESTAMP',
    );
  });

  it('calculates the next month correctly across a year boundary', async () => {
    dataSource.query.mockResolvedValue([
      {
        total_purchase_orders: 0,
        completed_purchase_orders: 0,
        overdue_purchase_orders: 0,
        active_employees: 0,
      },
    ]);

    await service.getSummary('2026-12');

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      '2026-12-01',
      '2027-01-01',
    ]);
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
        total_purchase_orders: '4',
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
      totalPurchaseOrders: 4,
      overduePurchaseOrders: 1,
      upcomingPurchaseOrders: 0,
      items,
      meta: { page: 2, limit: 10, totalPages: 1 },
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
});
