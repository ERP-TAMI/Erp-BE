export type DashboardPeriodType = 'month' | 'year' | 'range' | 'all';

export type DashboardComparisonBounds = {
  currentEndExclusive: string;
  comparison: {
    periodStart: string;
    periodEndExclusive: string;
  } | null;
};

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const EARLIEST_SUPPORTED_DATE = '0001-01-01';

export function getDashboardComparisonBounds(
  periodType: DashboardPeriodType,
  periodStart: string,
  periodEndExclusive: string,
  today: string,
): DashboardComparisonBounds {
  if (periodType === 'all') {
    return { currentEndExclusive: periodEndExclusive, comparison: null };
  }

  const todayEndExclusive = shiftIsoDate(today, 1);
  if (periodStart > today) {
    return { currentEndExclusive: periodStart, comparison: null };
  }

  const currentEndExclusive =
    periodEndExclusive < todayEndExclusive
      ? periodEndExclusive
      : todayEndExclusive;
  const isCurrentPeriodPartial = currentEndExclusive < periodEndExclusive;

  let comparisonStart: string | null = null;
  if (periodType === 'month') {
    comparisonStart = shiftCalendarMonths(periodStart, -1);
  } else if (periodType === 'year') {
    comparisonStart = shiftCalendarYears(periodStart, -1);
  } else {
    const periodLengthInDays = getDayDifference(
      periodStart,
      periodEndExclusive,
    );
    comparisonStart = shiftIsoDate(periodStart, -periodLengthInDays);
  }

  if (!comparisonStart || comparisonStart < EARLIEST_SUPPORTED_DATE) {
    return { currentEndExclusive, comparison: null };
  }

  const elapsedDays = getDayDifference(periodStart, currentEndExclusive);
  const comparisonEndExclusive = isCurrentPeriodPartial
    ? minIsoDate(shiftIsoDate(comparisonStart, elapsedDays), periodStart)
    : periodStart;

  return {
    currentEndExclusive,
    comparison: {
      periodStart: comparisonStart,
      periodEndExclusive: comparisonEndExclusive,
    },
  };
}

function shiftCalendarMonths(value: string, months: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toIsoDate(date);
}

function shiftCalendarYears(value: string, years: number): string {
  const date = parseIsoDate(value);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return toIsoDate(date);
}

function shiftIsoDate(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function getDayDifference(start: string, endExclusive: string): number {
  return (
    (parseIsoDate(endExclusive).getTime() - parseIsoDate(start).getTime()) /
    DAY_IN_MILLISECONDS
  );
}

function minIsoDate(left: string, right: string): string {
  return left < right ? left : right;
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
