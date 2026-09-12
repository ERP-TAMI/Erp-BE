import { BillOfMaterials } from './BillOfMaterials.entity';
import { BomRevision } from './BomRevision.entity';
import { BillOfMaterialLine } from './BillOfMaterialLine.entity';
import { BillOfMaterialStatusHistory } from './BillOfMaterialStatusHistory.entity';

export {
  BillOfMaterials,
  BomRevision,
  BillOfMaterialLine,
  BillOfMaterialStatusHistory,
};
export const BOMS_ENTITIES = [
  BillOfMaterials,
  BomRevision,
  BillOfMaterialLine,
  BillOfMaterialStatusHistory,
];
