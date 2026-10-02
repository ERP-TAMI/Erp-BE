import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ManagementDashboardSummaryDto } from './dto/management-dashboard-summary.dto';
import { DashboardSummaryQueryDto } from './dto/dashboard-summary-query.dto';
import { ManagementPurchaseOrdersQueryDto } from './dto/management-purchase-orders-query.dto';
import {
  ManagementPurchaseOrderItemDto,
  ManagementPurchaseOrdersOverviewDto,
} from './dto/management-purchase-orders-overview.dto';

type DashboardSummaryRow = {
  total_purchase_orders: string | number;
  completed_purchase_orders: string | number;
  cancelled_purchase_orders: string | number;
  processing_purchase_orders: string | number;
  overdue_product_purchase_orders: string | number;
  upcoming_product_purchase_orders: string | number;
  pending_boms: string | number;
  active_employees: string | number;
  trend: ManagementDashboardSummaryDto['trend'];
  purchase_order_statuses: ManagementDashboardSummaryDto['purchaseOrderStatuses'];
  bom_revision_statuses: ManagementDashboardSummaryDto['bomRevisionStatuses'];
  top_customers: ManagementDashboardSummaryDto['topCustomers'];
  overdue_queue: ManagementDashboardSummaryDto['overdueQueue'];
  upcoming_queue: ManagementDashboardSummaryDto['upcomingQueue'];
  pending_bom_queue: ManagementDashboardSummaryDto['pendingBomQueue'];
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

  async getSummary(
    period: DashboardSummaryQueryDto,
  ): Promise<ManagementDashboardSummaryDto> {
    return this.getDashboardSummary(period, true);
  }

  async getBusinessSummary(
    period: DashboardSummaryQueryDto,
  ): Promise<ManagementDashboardSummaryDto> {
    return this.getDashboardSummary(period, false);
  }

  private async getDashboardSummary(
    period: DashboardSummaryQueryDto,
    includeAdminMetrics: boolean,
  ): Promise<ManagementDashboardSummaryDto> {
    const { periodStart, periodEnd, periodEndExclusive } =
      await this.getPeriodBounds(period);
    const trendGranularity = this.getTrendGranularity(
      period,
      periodStart,
      periodEndExclusive,
    );
    const rows = await this.dataSource.query<DashboardSummaryRow[]>(
      `
        WITH date_context AS (
          SELECT
            $1::date AS period_start,
            $2::date AS period_end_exclusive,
            $3::text AS trend_granularity,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today
        ),
        selected_purchase_orders AS (
          SELECT
            purchase_order.id,
            purchase_order.po_code,
            purchase_order.customer_name_snapshot,
            purchase_order.status
          FROM purchase_orders AS purchase_order
          CROSS JOIN date_context
          WHERE purchase_order.received_date >= date_context.period_start
            AND purchase_order.received_date < date_context.period_end_exclusive
            AND purchase_order.archived_at IS NULL
        ),
        active_purchase_orders AS (
          SELECT id, po_code, customer_name_snapshot, status
          FROM selected_purchase_orders
        ),
        product_deadlines AS (
          SELECT
            purchase_order.id AS purchase_order_id,
            purchase_order.po_code,
            purchase_order.customer_name_snapshot,
            COUNT(*) FILTER (
              WHERE product.deadline < date_context.today
            ) AS overdue_product_count,
            MIN(product.deadline) FILTER (
              WHERE product.deadline < date_context.today
            ) AS overdue_deadline,
            COUNT(*) FILTER (
              WHERE product.deadline >= date_context.today
                AND product.deadline <= date_context.today + 6
            ) AS upcoming_product_count,
            MIN(product.deadline) FILTER (
              WHERE product.deadline >= date_context.today
                AND product.deadline <= date_context.today + 6
            ) AS upcoming_deadline
          FROM purchase_orders AS purchase_order
          INNER JOIN purchase_order_products AS product
            ON product.purchase_order_id = purchase_order.id
          CROSS JOIN date_context
          WHERE purchase_order.archived_at IS NULL
            AND purchase_order.status NOT IN ('closed', 'cancelled')
            AND product.status NOT IN ('closed', 'cancelled')
            AND product.deadline IS NOT NULL
            AND purchase_order.received_date >= date_context.period_start
            AND purchase_order.received_date < date_context.period_end_exclusive
            AND product.deadline <= date_context.today + 6
          GROUP BY purchase_order.id, purchase_order.po_code,
            purchase_order.customer_name_snapshot
        ),
        current_bom_revisions AS (
          SELECT
            bom.id AS bom_id,
            bom.bom_code,
            bom.product_name_snapshot,
            bom.product_code_snapshot,
            bom.bom_type,
            revision.status,
            revision.created_at
          FROM boms AS bom
          INNER JOIN bom_revisions AS revision
            ON bom.current_revision_id = revision.id
          CROSS JOIN date_context
          WHERE bom.discontinued_at IS NULL
            AND revision.created_at >= (
              date_context.period_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
            )
            AND revision.created_at < (
              date_context.period_end_exclusive::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
            )
        ),
        purchase_order_metrics AS (
          SELECT
            COUNT(*) FILTER (
              WHERE selected_purchase_order.status <> 'cancelled'
            ) AS total_purchase_orders,
            COUNT(*) FILTER (
              WHERE selected_purchase_order.status = 'closed'
            ) AS completed_purchase_orders,
            COUNT(*) FILTER (
              WHERE selected_purchase_order.status = 'cancelled'
            ) AS cancelled_purchase_orders,
            (SELECT COUNT(*)
             FROM active_purchase_orders
             WHERE status NOT IN ('closed', 'cancelled')
            ) AS processing_purchase_orders,
            (SELECT COUNT(DISTINCT product_deadline.purchase_order_id)
             FROM product_deadlines AS product_deadline
             WHERE product_deadline.overdue_product_count > 0
            ) AS overdue_product_purchase_orders,
            (SELECT COUNT(DISTINCT product_deadline.purchase_order_id)
             FROM product_deadlines AS product_deadline
             WHERE product_deadline.upcoming_product_count > 0
            ) AS upcoming_product_purchase_orders,
            (SELECT COUNT(*)
             FROM current_bom_revisions
             WHERE status IN (
               'wait_nvkh', 'wait_rd', 'wait_tpkh_confirm',
               'wait_accounting', 'wait_sa_approve'
             )
            ) AS pending_boms
          FROM selected_purchase_orders AS selected_purchase_order
        ),
        employee_metrics AS (
          SELECT COUNT(*) AS active_employees
          FROM users AS user_account
          CROSS JOIN date_context
          WHERE user_account.status = 'active'
            AND user_account.must_change_password = false
            AND user_account.manually_locked_at IS NULL
            AND (user_account.lockout_until IS NULL OR user_account.lockout_until <= CURRENT_TIMESTAMP)
            AND user_account.created_at >= (
              date_context.period_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
            )
            AND user_account.created_at < (
              date_context.period_end_exclusive::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
            )
        ),
        trend_series AS (
          SELECT generate_series(
            date_trunc(
              date_context.trend_granularity,
              date_context.period_start::timestamp
            ),
            date_trunc(
              date_context.trend_granularity,
              (date_context.period_end_exclusive - 1)::timestamp
            ),
            CASE date_context.trend_granularity
              WHEN 'day' THEN INTERVAL '1 day'
              WHEN 'month' THEN INTERVAL '1 month'
              ELSE INTERVAL '1 year'
            END
          )::date AS bucket_start
          FROM date_context
        ),
        period_received AS (
          SELECT date_trunc(
              date_context.trend_granularity,
              purchase_order.received_date::timestamp
            )::date AS bucket_start,
            COUNT(*) AS received
          FROM purchase_orders AS purchase_order
          CROSS JOIN date_context
          WHERE purchase_order.archived_at IS NULL
            AND purchase_order.status <> 'cancelled'
            AND purchase_order.received_date >= date_context.period_start
            AND purchase_order.received_date < date_context.period_end_exclusive
          GROUP BY date_trunc(
            date_context.trend_granularity,
            purchase_order.received_date::timestamp
          )::date
        ),
        period_completed AS (
          SELECT date_trunc(
              date_context.trend_granularity,
              purchase_order.received_date::timestamp
            )::date AS bucket_start,
            COUNT(*) AS completed
          FROM purchase_orders AS purchase_order
          CROSS JOIN date_context
          WHERE purchase_order.archived_at IS NULL
            AND purchase_order.status = 'closed'
            AND purchase_order.received_date >= date_context.period_start
            AND purchase_order.received_date < date_context.period_end_exclusive
          GROUP BY date_trunc(
            date_context.trend_granularity,
            purchase_order.received_date::timestamp
          )::date
        ),
        trend_summary AS (
          SELECT COALESCE(
            json_agg(json_build_object(
              'period', CASE date_context.trend_granularity
                WHEN 'day' THEN to_char(trend_series.bucket_start, 'YYYY-MM-DD')
                WHEN 'month' THEN to_char(trend_series.bucket_start, 'YYYY-MM')
                ELSE to_char(trend_series.bucket_start, 'YYYY')
              END,
              'received', COALESCE(period_received.received, 0),
              'completed', COALESCE(period_completed.completed, 0)
            ) ORDER BY trend_series.bucket_start),
            '[]'::json
          ) AS data
          FROM trend_series
          CROSS JOIN date_context
          LEFT JOIN period_received USING (bucket_start)
          LEFT JOIN period_completed USING (bucket_start)
        ),
        po_status_summary AS (
          SELECT COALESCE(
            json_agg(json_build_object('status', status, 'count', count)
              ORDER BY status),
            '[]'::json
          ) AS data
          FROM (
            SELECT status, COUNT(*) AS count
            FROM active_purchase_orders
            GROUP BY status
          ) AS grouped_statuses
        ),
        bom_status_summary AS (
          SELECT COALESCE(
            json_agg(json_build_object('status', status, 'count', count)
              ORDER BY status),
            '[]'::json
          ) AS data
          FROM (
            SELECT status, COUNT(*) AS count
            FROM current_bom_revisions
            GROUP BY status
          ) AS grouped_statuses
        ),
        top_customer_summary AS (
          SELECT COALESCE(
            json_agg(json_build_object(
              'customerName', customer_name,
              'count', po_count
            ) ORDER BY po_count DESC, customer_name ASC),
            '[]'::json
          ) AS data
          FROM (
            SELECT COALESCE(NULLIF(BTRIM(customer_name_snapshot), ''), 'Chưa có tên')
                AS customer_name,
              COUNT(*) AS po_count
            FROM purchase_orders
            CROSS JOIN date_context
            WHERE archived_at IS NULL
              AND status <> 'cancelled'
              AND received_date >= date_context.period_start
              AND received_date < date_context.period_end_exclusive
            GROUP BY COALESCE(NULLIF(BTRIM(customer_name_snapshot), ''), 'Chưa có tên')
            ORDER BY po_count DESC, customer_name ASC
            LIMIT 5
          ) AS customers
        ),
        overdue_queue AS (
          SELECT COALESCE(
            json_agg(json_build_object(
              'purchaseOrderId', queue.purchase_order_id,
              'poCode', queue.po_code,
              'customerName', queue.customer_name_snapshot,
              'deadline', to_char(queue.overdue_deadline, 'YYYY-MM-DD'),
              'productCount', queue.overdue_product_count
            ) ORDER BY queue.overdue_deadline ASC, queue.po_code ASC),
            '[]'::json
          ) AS data
          FROM (
            SELECT * FROM product_deadlines
            WHERE overdue_product_count > 0
            ORDER BY overdue_deadline ASC, po_code ASC
            LIMIT 5
          ) AS queue
        ),
        upcoming_queue AS (
          SELECT COALESCE(
            json_agg(json_build_object(
              'purchaseOrderId', queue.purchase_order_id,
              'poCode', queue.po_code,
              'customerName', queue.customer_name_snapshot,
              'deadline', to_char(queue.upcoming_deadline, 'YYYY-MM-DD'),
              'productCount', queue.upcoming_product_count
            ) ORDER BY queue.upcoming_deadline ASC, queue.po_code ASC),
            '[]'::json
          ) AS data
          FROM (
            SELECT * FROM product_deadlines
            WHERE upcoming_product_count > 0
            ORDER BY upcoming_deadline ASC, po_code ASC
            LIMIT 5
          ) AS queue
        ),
        pending_bom_queue AS (
          SELECT COALESCE(
            json_agg(json_build_object(
              'bomId', queue.bom_id,
              'bomCode', queue.bom_code,
              'productName', COALESCE(
                NULLIF(BTRIM(queue.product_name_snapshot), ''),
                NULLIF(BTRIM(queue.product_code_snapshot), ''),
                'Chưa có tên sản phẩm'
              ),
              'bomType', queue.bom_type,
              'status', queue.status,
              'createdAt', queue.created_at
            ) ORDER BY queue.created_at ASC, queue.bom_code ASC),
            '[]'::json
          ) AS data
          FROM (
            SELECT * FROM current_bom_revisions
            WHERE status IN (
              'wait_nvkh', 'wait_rd', 'wait_tpkh_confirm',
              'wait_accounting', 'wait_sa_approve'
            )
            ORDER BY created_at ASC, bom_code ASC
            LIMIT 5
          ) AS queue
        )
        SELECT
          purchase_order_metrics.total_purchase_orders,
          purchase_order_metrics.completed_purchase_orders,
          purchase_order_metrics.cancelled_purchase_orders,
          purchase_order_metrics.processing_purchase_orders,
          purchase_order_metrics.overdue_product_purchase_orders,
          purchase_order_metrics.upcoming_product_purchase_orders,
          purchase_order_metrics.pending_boms,
          employee_metrics.active_employees,
          trend_summary.data AS trend,
          po_status_summary.data AS purchase_order_statuses,
          bom_status_summary.data AS bom_revision_statuses,
          top_customer_summary.data AS top_customers,
          overdue_queue.data AS overdue_queue,
          upcoming_queue.data AS upcoming_queue,
          pending_bom_queue.data AS pending_bom_queue
        FROM purchase_order_metrics
        CROSS JOIN employee_metrics
        CROSS JOIN trend_summary
        CROSS JOIN po_status_summary
        CROSS JOIN bom_status_summary
        CROSS JOIN top_customer_summary
        CROSS JOIN overdue_queue
        CROSS JOIN upcoming_queue
        CROSS JOIN pending_bom_queue
      `,
      [periodStart, periodEndExclusive, trendGranularity],
    );
    const [summary] = rows;

    const result: ManagementDashboardSummaryDto = {
      periodType: period.periodType,
      periodStart,
      periodEnd,
      trendGranularity,
      totalPurchaseOrders: Number(summary.total_purchase_orders),
      completedPurchaseOrders: Number(summary.completed_purchase_orders),
      cancelledPurchaseOrders: Number(summary.cancelled_purchase_orders),
      processingPurchaseOrders: Number(summary.processing_purchase_orders),
      overdueProductPurchaseOrders: Number(
        summary.overdue_product_purchase_orders,
      ),
      upcomingProductPurchaseOrders: Number(
        summary.upcoming_product_purchase_orders,
      ),
      pendingBomCount: Number(summary.pending_boms),
      trend: summary.trend,
      purchaseOrderStatuses: summary.purchase_order_statuses,
      bomRevisionStatuses: summary.bom_revision_statuses,
      topCustomers: summary.top_customers,
      overdueQueue: summary.overdue_queue,
      upcomingQueue: summary.upcoming_queue,
      pendingBomQueue: summary.pending_bom_queue,
    };

    if (includeAdminMetrics) {
      result.activeEmployees = Number(summary.active_employees);
    }

    return result;
  }

  async getPurchaseOrdersOverview(
    query: ManagementPurchaseOrdersQueryDto,
  ): Promise<ManagementPurchaseOrdersOverviewDto> {
    const [monthStart, nextMonthStart] = this.getMonthBounds(query.month);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new BadRequestException('page and limit produce an unsafe offset');
    }
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

  private async getPeriodBounds(period: DashboardSummaryQueryDto): Promise<{
    periodStart: string;
    periodEnd: string;
    periodEndExclusive: string;
  }> {
    if (period.periodType === 'all') {
      const [bounds] = await this.dataSource.query<
        Array<{ period_start: string; period_end: string }>
      >(
        `
          SELECT
            COALESCE(MIN(event_date), (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS period_start,
            COALESCE(MAX(event_date), (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS period_end
          FROM (
            SELECT received_date AS event_date
            FROM purchase_orders
            WHERE archived_at IS NULL

            UNION ALL

            SELECT (revision.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS event_date
            FROM boms AS bom
            INNER JOIN bom_revisions AS revision
              ON bom.current_revision_id = revision.id
            WHERE bom.discontinued_at IS NULL

            UNION ALL

            SELECT (user_account.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS event_date
            FROM users AS user_account
            WHERE user_account.status = 'active'
              AND user_account.must_change_password = false
              AND user_account.manually_locked_at IS NULL
              AND (user_account.lockout_until IS NULL OR user_account.lockout_until <= CURRENT_TIMESTAMP)
          ) AS dashboard_event_dates
        `,
      );
      return {
        periodStart: bounds.period_start,
        periodEnd: bounds.period_end,
        periodEndExclusive: shiftIsoDate(bounds.period_end, 1),
      };
    }

    if (period.periodType === 'month' && period.month) {
      const [periodStart, periodEndExclusive] = this.getMonthBounds(
        period.month,
      );
      return {
        periodStart,
        periodEnd: shiftIsoDate(periodEndExclusive, -1),
        periodEndExclusive,
      };
    }

    if (period.periodType === 'year' && period.year) {
      if (!/^(?!0000)\d{4}$/.test(period.year)) {
        throw new BadRequestException('year must use YYYY format');
      }
      const nextYear = String(Number(period.year) + 1).padStart(4, '0');
      return {
        periodStart: `${period.year}-01-01`,
        periodEnd: `${period.year}-12-31`,
        periodEndExclusive: `${nextYear}-01-01`,
      };
    }

    if (
      period.periodType === 'range' &&
      period.fromDate &&
      period.toDate &&
      isValidIsoDate(period.fromDate) &&
      isValidIsoDate(period.toDate) &&
      period.fromDate <= period.toDate
    ) {
      return {
        periodStart: period.fromDate,
        periodEnd: period.toDate,
        periodEndExclusive: shiftIsoDate(period.toDate, 1),
      };
    }

    throw new BadRequestException('Invalid dashboard summary period');
  }

  private getTrendGranularity(
    period: DashboardSummaryQueryDto,
    periodStart: string,
    periodEndExclusive: string,
  ): 'day' | 'month' | 'year' {
    if (period.periodType === 'month') return 'day';
    if (period.periodType === 'year') return 'month';

    const selectedDays =
      dateOrdinal(periodEndExclusive) - dateOrdinal(periodStart);
    if (selectedDays <= 31) return 'day';
    if (selectedDays <= 730) return 'month';
    return 'year';
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

function isValidIsoDate(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function shiftIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day + days);
  date.setUTCHours(0, 0, 0, 0);
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function dateOrdinal(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / 86_400_000;
}
