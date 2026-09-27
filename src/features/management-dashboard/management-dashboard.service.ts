import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ManagementDashboardSummaryDto } from './dto/management-dashboard-summary.dto';

type DashboardSummaryRow = {
  total_purchase_orders: string | number;
  completed_purchase_orders: string | number;
  overdue_purchase_orders: string | number;
  active_employees: string | number;
};

@Injectable()
export class ManagementDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getSummary(month: string): Promise<ManagementDashboardSummaryDto> {
    const [monthStart, nextMonthStart] = this.getMonthBounds(month);
    const rows = await this.dataSource.query<DashboardSummaryRow[]>(
      `
        WITH selected_purchase_orders AS (
          SELECT purchase_order.status, purchase_order.deadline
          FROM purchase_orders AS purchase_order
          WHERE purchase_order.received_date >= $1::date
            AND purchase_order.received_date < $2::date
            AND purchase_order.archived_at IS NULL
        ),
        purchase_order_metrics AS (
          SELECT
            COUNT(*) AS total_purchase_orders,
            COUNT(*) FILTER (
              WHERE selected_purchase_order.status = 'closed'
            ) AS completed_purchase_orders,
            COUNT(*) FILTER (
              WHERE selected_purchase_order.status NOT IN ('closed', 'cancelled')
                AND selected_purchase_order.deadline < (
                  CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
                )::date
            ) AS overdue_purchase_orders
          FROM selected_purchase_orders AS selected_purchase_order
        ),
        employee_metrics AS (
          SELECT COUNT(*) AS active_employees
          FROM users
          WHERE status = 'active'
            AND must_change_password = false
            AND manually_locked_at IS NULL
            AND (lockout_until IS NULL OR lockout_until <= CURRENT_TIMESTAMP)
        )
        SELECT
          purchase_order_metrics.total_purchase_orders,
          purchase_order_metrics.completed_purchase_orders,
          purchase_order_metrics.overdue_purchase_orders,
          employee_metrics.active_employees
        FROM purchase_order_metrics
        CROSS JOIN employee_metrics
      `,
      [monthStart, nextMonthStart],
    );
    const [summary] = rows;

    return {
      month,
      totalPurchaseOrders: Number(summary.total_purchase_orders),
      completedPurchaseOrders: Number(summary.completed_purchase_orders),
      overduePurchaseOrders: Number(summary.overdue_purchase_orders),
      activeEmployees: Number(summary.active_employees),
    };
  }

  private getMonthBounds(month: string): [string, string] {
    const [yearText, monthText] = month.split('-');
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    const nextYear = monthNumber === 12 ? year + 1 : year;
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;

    return [
      `${yearText}-${monthText}-01`,
      `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    ];
  }
}
