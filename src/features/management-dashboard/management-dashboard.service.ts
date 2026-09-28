import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ManagementDashboardSummaryDto } from './dto/management-dashboard-summary.dto';
import { ManagementPurchaseOrdersQueryDto } from './dto/management-purchase-orders-query.dto';
import {
  ManagementPurchaseOrderItemDto,
  ManagementPurchaseOrdersOverviewDto,
} from './dto/management-purchase-orders-overview.dto';

type DashboardSummaryRow = {
  total_purchase_orders: string | number;
  completed_purchase_orders: string | number;
  overdue_purchase_orders: string | number;
  active_employees: string | number;
};

type PurchaseOrdersOverviewRow = {
  total_purchase_orders: string | number;
  overdue_purchase_orders: string | number;
  upcoming_purchase_orders: string | number;
  items: ManagementPurchaseOrderItemDto[];
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

  async getPurchaseOrdersOverview(
    query: ManagementPurchaseOrdersQueryDto,
  ): Promise<ManagementPurchaseOrdersOverviewDto> {
    const [monthStart, nextMonthStart] = this.getMonthBounds(query.month);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;
    const [row] = await this.dataSource.query<PurchaseOrdersOverviewRow[]>(
      `
        WITH date_context AS (
          SELECT
            $1::date AS next_month_start,
            $2::date AS month_start,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today
        ),
        selected_purchase_orders AS (
          SELECT
            purchase_order.id,
            purchase_order.po_code,
            purchase_order.customer_name_snapshot,
            purchase_order.received_date,
            purchase_order.deadline,
            purchase_order.status,
            CASE
              WHEN purchase_order.status = 'cancelled' THEN 'cancelled'
              WHEN purchase_order.status = 'closed' THEN 'completed'
              WHEN purchase_order.deadline < date_context.today THEN 'overdue'
              ELSE 'not_completed'
            END AS management_status,
            purchase_order.deadline - date_context.today AS days_to_deadline
          FROM purchase_orders AS purchase_order
          CROSS JOIN date_context
          WHERE purchase_order.received_date < date_context.next_month_start
            AND purchase_order.deadline >= date_context.month_start
            AND purchase_order.archived_at IS NULL
        ),
        metrics AS (
          SELECT
            COUNT(*) AS total_purchase_orders,
            COUNT(*) FILTER (
              WHERE selected_purchase_order.management_status = 'overdue'
            ) AS overdue_purchase_orders,
            COUNT(*) FILTER (
              WHERE selected_purchase_order.management_status = 'not_completed'
                AND selected_purchase_order.days_to_deadline >= 0
                AND selected_purchase_order.days_to_deadline < 7
            ) AS upcoming_purchase_orders
          FROM selected_purchase_orders AS selected_purchase_order
        ),
        page_items AS (
          SELECT selected_purchase_order.*
          FROM selected_purchase_orders AS selected_purchase_order
          ORDER BY selected_purchase_order.deadline ASC,
            selected_purchase_order.received_date ASC,
            selected_purchase_order.id ASC
          OFFSET $3 LIMIT $4
        ),
        items AS (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', page_item.id,
                'poCode', page_item.po_code,
                'customerNameSnapshot', page_item.customer_name_snapshot,
                'receivedDate', to_char(page_item.received_date, 'YYYY-MM-DD'),
                'deadline', to_char(page_item.deadline, 'YYYY-MM-DD'),
                'status', page_item.status,
                'managementStatus', page_item.management_status,
                'daysToDeadline', page_item.days_to_deadline
              ) ORDER BY page_item.deadline ASC,
                page_item.received_date ASC,
                page_item.id ASC
            ),
            '[]'::json
          ) AS data
          FROM page_items AS page_item
        )
        SELECT
          metrics.total_purchase_orders,
          metrics.overdue_purchase_orders,
          metrics.upcoming_purchase_orders,
          items.data AS items
        FROM metrics
        CROSS JOIN items
      `,
      [nextMonthStart, monthStart, offset, limit],
    );
    const total = Number(row.total_purchase_orders);

    return {
      month: query.month,
      totalPurchaseOrders: total,
      overduePurchaseOrders: Number(row.overdue_purchase_orders),
      upcomingPurchaseOrders: Number(row.upcoming_purchase_orders),
      items: row.items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
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
