import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

export type DashboardSummaryPeriod =
  | { periodType: 'month'; month: string }
  | { periodType: 'year'; year: string }
  | { periodType: 'range'; fromDate: string; toDate: string }
  | { periodType: 'all' };

const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
const yearPattern = /^(?!0000)\d{4}$/;
const datePattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
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

@ValidatorConstraint({ name: 'dashboardSummaryPeriod', async: false })
class DashboardSummaryPeriodConstraint implements ValidatorConstraintInterface {
  validate(_periodType: unknown, args: ValidationArguments): boolean {
    const query = args.object as Record<string, unknown>;
    const has = (key: string) => query[key] !== undefined;

    if (query.periodType === 'month') {
      return (
        typeof query.month === 'string' &&
        monthPattern.test(query.month) &&
        !has('year') &&
        !has('fromDate') &&
        !has('toDate')
      );
    }
    if (query.periodType === 'year') {
      return (
        typeof query.year === 'string' &&
        yearPattern.test(query.year) &&
        !has('month') &&
        !has('fromDate') &&
        !has('toDate')
      );
    }
    if (query.periodType === 'range') {
      return (
        typeof query.fromDate === 'string' &&
        typeof query.toDate === 'string' &&
        isCalendarDate(query.fromDate) &&
        isCalendarDate(query.toDate) &&
        query.fromDate <= query.toDate &&
        !has('month') &&
        !has('year')
      );
    }
    if (query.periodType === 'all') {
      return (
        !has('month') && !has('year') && !has('fromDate') && !has('toDate')
      );
    }
    return false;
  }

  defaultMessage(): string {
    return 'Provide exactly one valid dashboard period: month, year, inclusive date range, or all';
  }
}

export class DashboardSummaryQueryDto {
  @ApiProperty({ enum: ['month', 'year', 'range', 'all'], example: 'month' })
  @IsIn(['month', 'year', 'range', 'all'])
  @Validate(DashboardSummaryPeriodConstraint)
  periodType: DashboardSummaryPeriod['periodType'];

  @ApiPropertyOptional({ example: '2026-10', pattern: monthPattern.source })
  @IsOptional()
  @IsString()
  @Matches(monthPattern)
  month?: string;

  @ApiPropertyOptional({ example: '2026', pattern: yearPattern.source })
  @IsOptional()
  @IsString()
  @Matches(yearPattern)
  year?: string;

  @ApiPropertyOptional({ example: '2026-10-01', pattern: datePattern.source })
  @IsOptional()
  @IsString()
  @Matches(datePattern)
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-10-31', pattern: datePattern.source })
  @IsOptional()
  @IsString()
  @Matches(datePattern)
  toDate?: string;
}
