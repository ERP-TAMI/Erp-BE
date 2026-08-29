export const POSTGRES_INTEGER_MAX = 2_147_483_647;

export const trimWorkshopText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const normalizeWorkshopCode = ({
  value,
}: {
  value: unknown;
}): unknown => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export const rejectNullNumber = ({ value }: { value: unknown }): unknown =>
  value === null ? Number.NaN : value;
