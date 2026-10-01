import { BadRequestException } from '@nestjs/common';
import { EntityFieldChange } from '../audit/entity-diff.util';

export const MAX_BULK_LINES = 500;

export interface LineSnapshot {
  id: string;
  materialId: string | null;
  materialNameSnapshot: string;
  consumption: number | string;
  unitCost: number | string | null;
  note: string | null;
  orderIndex: number;
}

export interface LineInput {
  lineId?: string;
  materialId?: string;
  consumption?: number;
  note?: string | null;
}

export interface LinePatch {
  materialId?: string;
  consumption?: number;
  note?: string | null;
}

export interface LinesPlan {
  creates: { index: number; input: LineInput }[];
  updates: { index: number; line: LineSnapshot; patch: LinePatch }[];
  deletes: LineSnapshot[];
  kept: { index: number; line: LineSnapshot }[];
  reordered: boolean;
  reindex: boolean;
  unchanged: boolean;
}

const sameNumber = (a: unknown, b: unknown): boolean => Number(a) === Number(b);

const normalizeNote = (note: string | null | undefined): string =>
  (note ?? '').trim();

export function planLinesSave(
  current: LineSnapshot[],
  desired: LineInput[],
): LinesPlan {
  const byId = new Map(current.map((line) => [line.id, line]));
  const rowErrors: { index: number; message: string }[] = [];
  const seenIds = new Set<string>();
  const seenMaterials = new Set<string>();

  desired.forEach((item, index) => {
    let effectiveMaterial: string | null | undefined;
    if (item.lineId) {
      const line = byId.get(item.lineId);
      if (!line) {
        rowErrors.push({
          index,
          message: 'Dòng không thuộc phiên bản hiện hành của NPL này.',
        });
        return;
      }
      if (seenIds.has(item.lineId)) {
        rowErrors.push({ index, message: 'Dòng bị lặp trong bảng.' });
        return;
      }
      seenIds.add(item.lineId);
      effectiveMaterial = item.materialId ?? line.materialId;
    } else {
      if (!item.materialId) {
        rowErrors.push({ index, message: 'Dòng mới phải chọn vật tư.' });
        return;
      }
      effectiveMaterial = item.materialId;
    }
    if (effectiveMaterial) {
      if (seenMaterials.has(effectiveMaterial)) {
        rowErrors.push({
          index,
          message: 'Vật tư này đã có ở dòng khác trong bảng.',
        });
        return;
      }
      seenMaterials.add(effectiveMaterial);
    }
  });

  if (rowErrors.length > 0) {
    throw new BadRequestException({
      message: 'Bảng định mức có dòng không hợp lệ.',
      rowErrors,
    });
  }

  const creates: LinesPlan['creates'] = [];
  const updates: LinesPlan['updates'] = [];
  const kept: LinesPlan['kept'] = [];

  desired.forEach((input, index) => {
    if (!input.lineId) {
      creates.push({ index, input });
      return;
    }
    const line = byId.get(input.lineId) as LineSnapshot;
    kept.push({ index, line });
    const patch: LinePatch = {};
    if (
      input.materialId !== undefined &&
      input.materialId !== line.materialId
    ) {
      patch.materialId = input.materialId;
    }
    if (
      input.consumption !== undefined &&
      !sameNumber(input.consumption, line.consumption)
    ) {
      patch.consumption = input.consumption;
    }
    if (
      input.note !== undefined &&
      normalizeNote(input.note) !== normalizeNote(line.note)
    ) {
      patch.note = input.note ?? null;
    }
    if (Object.keys(patch).length > 0) updates.push({ index, line, patch });
  });

  const deletes = current.filter((line) => !seenIds.has(line.id));

  const keptIdsInCurrentOrder = current
    .filter((line) => seenIds.has(line.id))
    .map((line) => line.id);
  const keptIdsInDesiredOrder = kept.map((entry) => entry.line.id);
  const reordered = keptIdsInCurrentOrder.some(
    (id, position) => id !== keptIdsInDesiredOrder[position],
  );

  const reindex = kept.some((entry) => entry.line.orderIndex !== entry.index);

  return {
    creates,
    updates,
    deletes,
    kept,
    reordered,
    reindex,
    unchanged:
      creates.length === 0 &&
      updates.length === 0 &&
      deletes.length === 0 &&
      !reordered,
  };
}

export interface AfterLine {
  materialName: string;
  consumption: number | string;
  note: string | null;
}

export interface LineAuditResult {
  changes: EntityFieldChange[];
  reason: string;
  created: number;
  updated: number;
  deleted: number;
}

const rowLabel = (name: string | null | undefined): string =>
  name?.trim() || '(chưa chọn vật tư)';

const toNumber = (value: number | string | null): number | null =>
  value === null || value === undefined ? null : Number(value);

const displayNote = (note: string | null | undefined): string | null =>
  note && note.trim() ? note : null;

/** Dựng nội dung audit cho 1 lần lưu bảng dòng: mỗi dòng đổi gì được mã hoá
 * thành "<tên vật tư>::<field>" để drawer lịch sử nhóm theo dòng. */
export function buildLineAuditChanges(input: {
  plan: LinesPlan;
  createdAfter: AfterLine[];
  updatedAfter: Map<string, AfterLine>;
  finalIndexById: Map<string, number>;
}): LineAuditResult {
  const { plan, createdAfter, updatedAfter, finalIndexById } = input;
  const changes: EntityFieldChange[] = [];

  plan.creates.forEach((entry, position) => {
    const after = createdAfter[position];
    const label = rowLabel(after.materialName);
    changes.push({
      fieldName: `${label}::materialName`,
      oldValue: null,
      newValue: after.materialName,
    });
    changes.push({
      fieldName: `${label}::consumption`,
      oldValue: null,
      newValue: toNumber(after.consumption),
    });
    if (displayNote(after.note)) {
      changes.push({
        fieldName: `${label}::note`,
        oldValue: null,
        newValue: after.note,
      });
    }
  });

  for (const { line, patch } of plan.updates) {
    const after = updatedAfter.get(line.id) as AfterLine;
    const label = rowLabel(line.materialNameSnapshot);
    if (patch.materialId !== undefined) {
      changes.push({
        fieldName: `${label}::materialName`,
        oldValue: line.materialNameSnapshot,
        newValue: after.materialName,
      });
    }
    if (patch.consumption !== undefined) {
      changes.push({
        fieldName: `${label}::consumption`,
        oldValue: toNumber(line.consumption),
        newValue: toNumber(after.consumption),
      });
    }
    if (patch.note !== undefined) {
      changes.push({
        fieldName: `${label}::note`,
        oldValue: displayNote(line.note),
        newValue: displayNote(after.note),
      });
    }
  }

  for (const line of plan.deletes) {
    changes.push({
      fieldName: `${rowLabel(line.materialNameSnapshot)}::materialName`,
      oldValue: line.materialNameSnapshot,
      newValue: null,
    });
  }

  if (plan.reordered) {
    for (const { line } of plan.kept) {
      const finalIndex = finalIndexById.get(line.id);
      if (finalIndex === undefined || finalIndex === line.orderIndex) continue;
      changes.push({
        fieldName: `${rowLabel(line.materialNameSnapshot)}::orderIndex`,
        oldValue: line.orderIndex + 1,
        newValue: finalIndex + 1,
      });
    }
  }

  const parts: string[] = [];
  if (plan.creates.length > 0) parts.push(`Thêm ${plan.creates.length} dòng`);
  if (plan.updates.length > 0) parts.push(`Sửa ${plan.updates.length} dòng`);
  if (plan.deletes.length > 0) parts.push(`Xoá ${plan.deletes.length} dòng`);
  if (plan.reordered) parts.push('Đổi thứ tự');

  return {
    changes,
    reason: parts.join('; '),
    created: plan.creates.length,
    updated: plan.updates.length,
    deleted: plan.deletes.length,
  };
}
