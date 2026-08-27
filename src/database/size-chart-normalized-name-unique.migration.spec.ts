import { QueryRunner } from 'typeorm';
import { AddSizeChartNormalizedNameUnique1740000000012 } from './migrations/1740000000012-AddSizeChartNormalizedNameUnique';

describe('AddSizeChartNormalizedNameUnique1740000000012', () => {
  const migration = new AddSizeChartNormalizedNameUnique1740000000012();

  it('checks existing data before adding the normalized unique index', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    const preflightIndex = sql.indexOf('GROUP BY lower(btrim(name))');
    const createIndex = sql.indexOf(
      'CREATE UNIQUE INDEX uq_size_charts_name_normalized',
    );

    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(preflightIndex);
    expect(sql).toContain(
      'Cannot add normalized size chart name uniqueness: duplicate names exist',
    );
    expect(sql).toContain('ON size_charts (lower(btrim(name)))');
  });

  it('drops only the normalized unique index on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.down({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS uq_size_charts_name_normalized;',
    );
  });
});
