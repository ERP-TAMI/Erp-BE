import { createHash } from 'node:crypto';
import { STAGE_GROUP_SEEDS } from './seed-stage-groups';
import { STAGE_SEEDS } from './seed-stages';

export type MaterialGroupSample = { id: string; name: string };
export type MaterialSample = {
  id: string;
  materialCode: string;
  materialName: string;
  groupName: string;
  unitName: 'Cái' | 'Mét';
  defaultYieldPct: string;
};
export type WorkshopSample = {
  id: string;
  workshopCode: string;
  name: string;
  manager: string | null;
  location: string | null;
  dailyCapacity: number;
};
export type SizeChartSample = {
  id: string;
  name: string;
  sizes: readonly string[];
};

/**
 * Stable fixture UUID. The namespace and natural key, not array position,
 * define identity so adding/reordering catalog rows cannot change old IDs.
 */
export function stableSampleId(namespace: string, naturalKey: string): string {
  const bytes = createHash('sha256')
    .update(`tami:s2-master-08:${namespace}:${naturalKey}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const materialGroupNames = [
  'FUSIBLE',
  'TAPE',
  'MAIN LABEL',
  'SIZE LABEL (SIZECOO)',
  'CARE LABEL',
  'HANGTAG',
  'JOKER TAG',
  'SWIFTACK',
  'HANGER',
  'ĐỆM VAI',
  'ZIPPER',
  'ZIPPER TAPE',
  'ZIPPER PULL',
  'BUTTON',
] as const;

export const MATERIAL_GROUP_SEEDS: readonly MaterialGroupSample[] =
  materialGroupNames.map((name) => ({
    id: stableSampleId('material-group', name),
    name,
  }));

const material = (
  materialCode: string,
  materialName: string,
  groupName: string,
  unitName: 'Cái' | 'Mét' = 'Cái',
  defaultYieldPct = unitName === 'Mét' ? '5' : '2',
): MaterialSample => ({
  id: stableSampleId('material', materialCode),
  materialCode,
  materialName,
  groupName,
  unitName,
  defaultYieldPct,
});

// Curated from be-demo: every group has a usable selector option without
// copying the entire legacy catalog into the maintained seed contract.
export const MATERIAL_SEEDS: readonly MaterialSample[] = [
  material('FUS-BLK', 'FUSIBLE BLK', 'FUSIBLE', 'Mét'),
  material('FUS-WHT', 'FUSIBLE WHT', 'FUSIBLE', 'Mét'),
  material('TAPE-001', 'TAPE CLEAR 1/4', 'TAPE', 'Mét'),
  material('ML-001', 'SL-08 SOHO APPAREL WHITE', 'MAIN LABEL'),
  material('SL-001', 'SL-10 SOHO WHITE', 'SIZE LABEL (SIZECOO)'),
  material('CL-001', 'SL-09', 'CARE LABEL'),
  material('HT-001', 'SL-07 SOHO APPAREL PX TAG MSRP $60.00', 'HANGTAG'),
  material('HT-020', 'NICOLLE WITH RFID', 'HANGTAG'),
  material('JK-001', 'SL-16 SOHO APPAREL WHITE', 'JOKER TAG'),
  material('SA-001', '1" CLEAR', 'SWIFTACK'),
  material('HG-001', '484-17', 'HANGER'),
  material('SP-001', 'VN497', 'ĐỆM VAI'),
  material('ZP-001', 'VN564 GUNMETAL', 'ZIPPER'),
  material('ZT-001', 'ADMIRAL', 'ZIPPER TAPE', 'Mét'),
  material('ZP-P001', 'VN-133 GOLD', 'ZIPPER PULL'),
  material('BT-001', '40L P.RIM SHINY BUTTON - DTM', 'BUTTON'),
];

const workshop = (
  workshopCode: string,
  name: string,
  manager: string | null,
  location: string | null,
  dailyCapacity: number,
): WorkshopSample => ({
  id: stableSampleId('workshop', workshopCode),
  workshopCode,
  name,
  manager,
  location,
  dailyCapacity,
});

export const WORKSHOP_SEEDS: readonly WorkshopSample[] = [
  workshop('BM-01', 'Xưởng May Bình Minh 1', null, null, 0),
  workshop('X-01', 'Xưởng May 1', 'Nguyễn Văn A', 'Tầng 1 - Khu A', 500),
  workshop('X-02', 'Xưởng May 2', 'Trần Thị B', 'Tầng 2 - Khu A', 450),
  workshop('X-03', 'Xưởng May 3 (Thể thao)', 'Lê Văn C', 'Tầng 1 - Khu B', 600),
  workshop(
    'X-04',
    'Xưởng May 4 (Cao cấp)',
    'Phạm Thị D',
    'Tầng 2 - Khu B',
    300,
  ),
  workshop('X-05', 'Xưởng Cắt', 'Hoàng Văn E', 'Tầng 3', 800),
  workshop('X-06', 'Xưởng Hoàn thiện', 'Đỗ Thị F', 'Tầng 4', 700),
  workshop('X-07', 'Xưởng Dệt len', 'Vũ Văn G', 'Khu C', 200),
  workshop('X-08', 'Xưởng Jean & Denim', 'Bùi Thị H', 'Khu D', 400),
];

const sizeChart = (
  name: string,
  sizes: readonly string[],
): SizeChartSample => ({
  id: stableSampleId('size-chart', name),
  name,
  sizes,
});

export const SIZE_CHART_SEEDS: readonly SizeChartSample[] = [
  sizeChart('Size chữ tiêu chuẩn', ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']),
  sizeChart('Size số nữ', [
    '0',
    '2',
    '4',
    '6',
    '8',
    '10',
    '12',
    '14',
    '16',
    '18',
  ]),
  sizeChart('Size trẻ em', ['2Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y']),
];

export const STABLE_SAMPLE_IDS = {
  materialGroups: Object.fromEntries(
    MATERIAL_GROUP_SEEDS.map((seed) => [seed.name, seed.id]),
  ),
  materials: Object.fromEntries(
    MATERIAL_SEEDS.map((seed) => [seed.materialCode, seed.id]),
  ),
  stages: Object.fromEntries(
    STAGE_SEEDS.map((seed) => [
      seed.stageCode,
      stableSampleId('stage', seed.stageCode),
    ]),
  ),
  stageGroups: Object.fromEntries(
    STAGE_GROUP_SEEDS.map((seed) => [
      seed.groupCode,
      stableSampleId('stage-group', seed.groupCode),
    ]),
  ),
  workshops: Object.fromEntries(
    WORKSHOP_SEEDS.map((seed) => [seed.workshopCode, seed.id]),
  ),
  sizeCharts: Object.fromEntries(
    SIZE_CHART_SEEDS.map((seed) => [seed.name, seed.id]),
  ),
} as const;
