import type { TransformFnParams } from 'class-transformer';

export const STAGE_SSV_PATTERN = /^\d{1,9}(?:\.\d{1,3})?$/;

export const normalizeStageCode = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const normalizeOptionalStageCode = ({
  value,
}: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toUpperCase();
  return normalized === '' ? undefined : normalized;
};

export const trimStageText = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const trimNullableStageText = ({
  value,
}: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
};

export const isStageValueProvided = (
  _object: object,
  value: unknown,
): boolean => value !== undefined;
