import type { TransformFnParams } from 'class-transformer';

export const normalizeSizeChartTextValue = (value: string): string =>
  value.trim().replace(/\s+/gu, ' ');

export const normalizeSizeChartText = ({
  value,
}: TransformFnParams): unknown =>
  typeof value === 'string' ? normalizeSizeChartTextValue(value) : value;

export const normalizeSizeChartLabels = ({
  value,
}: TransformFnParams): unknown =>
  Array.isArray(value)
    ? value
        .map((label) =>
          typeof label === 'string'
            ? normalizeSizeChartTextValue(label)
            : label,
        )
        .filter((label) => label !== '')
    : value;
