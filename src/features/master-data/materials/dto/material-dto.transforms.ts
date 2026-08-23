export const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const normalizeCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const MATERIAL_YIELD_PATTERN = /^\d{1,4}(?:\.\d{1,4})?$/;
export const MATERIAL_COST_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;
export const MATERIAL_STOCK_PATTERN = /^\d{1,14}(?:\.\d{1,4})?$/;

export const isProvided = (_object: object, value: unknown): boolean =>
  value !== undefined;
