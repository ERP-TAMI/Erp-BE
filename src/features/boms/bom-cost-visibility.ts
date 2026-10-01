export const COST_VISIBLE_ROLES: ReadonlySet<string> = new Set([
  'SA',
  'ACCOUNTING',
]);

export function isCostVisibleRole(roleCode?: string | null): boolean {
  if (!roleCode) return false;
  return COST_VISIBLE_ROLES.has(roleCode.trim().toUpperCase());
}
