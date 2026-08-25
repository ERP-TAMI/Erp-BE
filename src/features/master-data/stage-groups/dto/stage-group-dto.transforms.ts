import type { TransformFnParams } from 'class-transformer';

export const normalizeStageGroupCode = ({
  value,
}: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const normalizeOptionalStageGroupCode = ({
  value,
}: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim().toUpperCase() || undefined;
};

export const trimStageGroupText = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const trimNullableStageGroupText = ({
  value,
}: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  return value.trim() || null;
};
