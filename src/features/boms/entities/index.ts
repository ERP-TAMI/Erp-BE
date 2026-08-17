import { BillOfMaterials } from './BillOfMaterials.entity';
import { BillOfMaterialLine } from './BillOfMaterialLine.entity';
import { BillOfMaterialStatusHistory } from './BillOfMaterialStatusHistory.entity';

export { BillOfMaterials, BillOfMaterialLine, BillOfMaterialStatusHistory };
export const BOMS_ENTITIES = [
  BillOfMaterials,
  BillOfMaterialLine,
  BillOfMaterialStatusHistory,
];
