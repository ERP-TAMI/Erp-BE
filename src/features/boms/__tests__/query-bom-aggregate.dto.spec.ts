import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryBomAggregateDto } from '../dto/query-bom-aggregate.dto';

describe('QueryBomAggregateDto', () => {
  it('accepts year and inclusive date-range filters', async () => {
    const dto = plainToInstance(QueryBomAggregateDto, {
      year: '2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects malformed years and invalid calendar dates', async () => {
    const dto = plainToInstance(QueryBomAggregateDto, {
      year: '26',
      startDate: '2026-02-31',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['year', 'startDate']),
    );
  });

  it('parses a month and comma-separated PO product IDs from query parameters', async () => {
    const dto = plainToInstance(QueryBomAggregateDto, {
      month: '2026-09',
      purchaseOrderProductIds:
        '9acddc64-6248-44fb-a532-f5a849ca3fd1,32beb219-9ee2-43be-a626-e1e75836ff10',
    });

    expect(dto.purchaseOrderProductIds).toEqual([
      '9acddc64-6248-44fb-a532-f5a849ca3fd1',
      '32beb219-9ee2-43be-a626-e1e75836ff10',
    ]);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid month values and malformed product IDs', async () => {
    const dto = plainToInstance(QueryBomAggregateDto, {
      month: '2026-13',
      purchaseOrderProductIds: 'not-a-uuid',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['month', 'purchaseOrderProductIds']),
    );
  });
});
