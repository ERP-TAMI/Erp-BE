export type EntityFieldChange = {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
};

function normalize(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Field-by-field diff between the before/after state of an entity, restricted
 * to `trackedFields` so unrelated columns (rowVersion, timestamps, ids used
 * only for wiring) never show up as noise in a changelog.
 */
export function diffEntity<T extends object>(
  before: Partial<T> | null,
  after: T,
  trackedFields: readonly (keyof T & string)[],
): EntityFieldChange[] {
  const changes: EntityFieldChange[] = [];
  for (const field of trackedFields) {
    const oldValue: unknown = before ? before[field] : undefined;
    const newValue: unknown = after[field];
    if (normalize(oldValue) !== normalize(newValue)) {
      changes.push({
        fieldName: field,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
      });
    }
  }
  return changes;
}
