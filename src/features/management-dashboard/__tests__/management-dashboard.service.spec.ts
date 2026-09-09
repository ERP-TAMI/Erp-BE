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
    expect(sql).toContain(
      'product.purchase_order_id = selected_purchase_order.id',
    );
    expect(sql).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain("WHERE status = 'active'");
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
});
