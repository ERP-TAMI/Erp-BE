export const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const normalizeCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const MATERIAL_YIELD_PATTERN = /^\d{1,4}(?:\.\d{1,4})?$/;

export const isProvided = (_object: object, value: unknown): boolean =>
  value !== undefined;
