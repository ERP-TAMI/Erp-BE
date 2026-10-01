import { BadRequestException } from '@nestjs/common';
import {
  buildLineAuditChanges,
  LineSnapshot,
  planLinesSave,
} from '../bom-lines-plan';

const line = (
  id: string,
  materialId: string,
  orderIndex: number,
  overrides: Partial<LineSnapshot> = {},
): LineSnapshot => ({
  id,
  materialId,
  materialNameSnapshot: `Vật tư ${id}`,
  consumption: '1.000000',
  unitCost: null,
  note: null,
  orderIndex,
  ...overrides,
});

describe('planLinesSave', () => {
  const current = [line('A', 'mA', 0), line('B', 'mB', 1), line('C', 'mC', 2)];

  it('treats an identical table as unchanged', () => {
    const plan = planLinesSave(current, [
      { lineId: 'A', consumption: 1 },
      { lineId: 'B', consumption: 1 },
      { lineId: 'C', consumption: 1 },
    ]);
    expect(plan.unchanged).toBe(true);
  });

  it('creates, updates and deletes in one pass', () => {
    const plan = planLinesSave(current, [
      { lineId: 'A' },
      { lineId: 'B', consumption: 5 },
      { materialId: 'mD', consumption: 2 },
    ]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].index).toBe(2);
    expect(plan.updates.map((u) => u.line.id)).toEqual(['B']);
    expect(plan.updates[0].patch).toEqual({ consumption: 5 });
    expect(plan.deletes.map((l) => l.id)).toEqual(['C']);
    expect(plan.reordered).toBe(false);
    expect(plan.unchanged).toBe(false);
  });

  it('detects a reorder of kept lines but not a shift caused by a delete', () => {
    const shifted = planLinesSave(current, [{ lineId: 'B' }, { lineId: 'C' }]);
    expect(shifted.reordered).toBe(false);
    expect(shifted.reindex).toBe(true);

    const swapped = planLinesSave(current, [
      { lineId: 'B' },
      { lineId: 'A' },
      { lineId: 'C' },
    ]);
    expect(swapped.reordered).toBe(true);
  });

  it('allows swapping materials between two lines', () => {
    const plan = planLinesSave(current, [
      { lineId: 'A', materialId: 'mB' },
      { lineId: 'B', materialId: 'mA' },
      { lineId: 'C' },
    ]);
    expect(plan.updates).toHaveLength(2);
  });

  it('ignores whitespace-only note differences', () => {
    const plan = planLinesSave(
      [line('A', 'mA', 0, { note: 'ghi chú' })],
      [{ lineId: 'A', note: ' ghi chú ' }],
    );
    expect(plan.unchanged).toBe(true);
  });

  it('rejects a duplicate material with the row index', () => {
    try {
      planLinesSave(current, [
        { lineId: 'A' },
        { lineId: 'B', materialId: 'mA' },
      ]);
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as any;
      expect(body.rowErrors).toEqual([
        { index: 1, message: 'Vật tư này đã có ở dòng khác trong bảng.' },
      ]);
    }
  });

  it('rejects unknown and repeated lineIds and new rows without material', () => {
    expect(() => planLinesSave(current, [{ lineId: 'X' }])).toThrow(
      BadRequestException,
    );
    expect(() =>
      planLinesSave(current, [{ lineId: 'A' }, { lineId: 'A' }]),
    ).toThrow(BadRequestException);
    expect(() => planLinesSave(current, [{ consumption: 1 }])).toThrow(
      BadRequestException,
    );
  });
});

describe('buildLineAuditChanges', () => {
  it('prefixes every change with the row label and counts the operations', () => {
    const current = [
      line('A', 'mA', 0),
      line('B', 'mB', 1),
      line('C', 'mC', 2),
    ];
    const plan = planLinesSave(current, [
      { lineId: 'B', consumption: 5 },
      { lineId: 'A' },
      { materialId: 'mD', consumption: 2 },
    ]);
    const result = buildLineAuditChanges({
      plan,
      createdAfter: [{ materialName: 'Vật tư D', consumption: 2, note: null }],
      updatedAfter: new Map([
        ['B', { materialName: 'Vật tư B', consumption: 5, note: null }],
      ]),
      finalIndexById: new Map([
        ['B', 0],
        ['A', 1],
      ]),
    });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.reason).toBe(
      'Thêm 1 dòng; Sửa 1 dòng; Xoá 1 dòng; Đổi thứ tự',
    );
    const names = result.changes.map((c) => c.fieldName);
    expect(names).toContain('Vật tư D::materialName');
    expect(names).toContain('Vật tư B::consumption');
    expect(names).toContain('Vật tư C::materialName');
    expect(names).toContain('Vật tư B::orderIndex');
    const consumption = result.changes.find(
      (c) => c.fieldName === 'Vật tư B::consumption',
    );
    expect(consumption).toMatchObject({ oldValue: 1, newValue: 5 });
  });
});
