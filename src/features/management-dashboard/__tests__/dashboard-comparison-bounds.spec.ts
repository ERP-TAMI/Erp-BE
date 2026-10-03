import { getDashboardComparisonBounds } from '../dashboard-comparison-bounds';

describe('getDashboardComparisonBounds', () => {
  it('compares the elapsed part of the current month with the same days last month', () => {
    expect(
      getDashboardComparisonBounds(
        'month',
        '2026-10-01',
        '2026-11-01',
        '2026-10-02',
      ),
    ).toEqual({
      currentEndExclusive: '2026-10-03',
      comparison: {
        periodStart: '2026-09-01',
        periodEndExclusive: '2026-09-03',
      },
    });
  });

  it('uses the previous complete calendar month for a past month', () => {
    expect(
      getDashboardComparisonBounds(
        'month',
        '2026-03-01',
        '2026-04-01',
        '2026-10-02',
      ),
    ).toEqual({
      currentEndExclusive: '2026-04-01',
      comparison: {
        periodStart: '2026-02-01',
        periodEndExclusive: '2026-03-01',
      },
    });
  });

  it('caps a full month comparison when the previous month is shorter', () => {
    expect(
      getDashboardComparisonBounds(
        'month',
        '2026-03-01',
        '2026-04-01',
        '2026-10-02',
      ).comparison,
    ).toEqual({
      periodStart: '2026-02-01',
      periodEndExclusive: '2026-03-01',
    });
  });

  it('compares a current year through today with the same dates in the prior year', () => {
    expect(
      getDashboardComparisonBounds(
        'year',
        '2026-01-01',
        '2027-01-01',
        '2026-10-02',
      ),
    ).toEqual({
      currentEndExclusive: '2026-10-03',
      comparison: {
        periodStart: '2025-01-01',
        periodEndExclusive: '2025-10-03',
      },
    });
  });

  it('compares a custom date range to the immediately previous range of equal length', () => {
    expect(
      getDashboardComparisonBounds(
        'range',
        '2026-10-01',
        '2026-10-11',
        '2026-10-02',
      ),
    ).toEqual({
      currentEndExclusive: '2026-10-03',
      comparison: {
        periodStart: '2026-09-21',
        periodEndExclusive: '2026-09-23',
      },
    });
  });

  it('compares a completed custom range to the previous equal-length range', () => {
    expect(
      getDashboardComparisonBounds(
        'range',
        '2024-02-28',
        '2024-03-02',
        '2026-10-02',
      ),
    ).toEqual({
      currentEndExclusive: '2024-03-02',
      comparison: {
        periodStart: '2024-02-25',
        periodEndExclusive: '2024-02-28',
      },
    });
  });

  it('does not invent a comparison for all-time or future-only periods', () => {
    expect(
      getDashboardComparisonBounds(
        'all',
        '2020-01-01',
        '2026-10-03',
        '2026-10-02',
      ),
    ).toEqual({ currentEndExclusive: '2026-10-03', comparison: null });

    expect(
      getDashboardComparisonBounds(
        'range',
        '2026-10-05',
        '2026-10-10',
        '2026-10-02',
      ),
    ).toEqual({ currentEndExclusive: '2026-10-05', comparison: null });
  });
});
