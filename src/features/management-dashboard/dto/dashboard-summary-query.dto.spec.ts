import { validate } from 'class-validator';
import { DashboardSummaryQueryDto } from './dashboard-summary-query.dto';

describe('DashboardSummaryQueryDto', () => {
  it.each([
    { periodType: 'month', month: '2026-10' },
    { periodType: 'year', year: '2026' },
    { periodType: 'range', fromDate: '2026-10-01', toDate: '2026-10-31' },
  ])('accepts a valid $periodType period', async (query) => {
    await expect(
      validate(Object.assign(new DashboardSummaryQueryDto(), query)),
    ).resolves.toEqual([]);
  });

  it.each([
    { periodType: 'month', month: '2026-13' },
    { periodType: 'year', year: '0000' },
    { periodType: 'range', fromDate: '2026-02-30', toDate: '2026-03-01' },
    { periodType: 'range', fromDate: '2026-10-02', toDate: '2026-10-01' },
    { periodType: 'range', fromDate: '2026-10-01' },
    { periodType: 'month', month: '2026-10', year: '2026' },
  ])('rejects an invalid $periodType period', async (query) => {
    const errors = await validate(
      Object.assign(new DashboardSummaryQueryDto(), query),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
