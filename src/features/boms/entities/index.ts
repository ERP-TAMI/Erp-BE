import { Bom } from './Bom.entity';
import { BomRevision } from './BomRevision.entity';
import { BomLine } from './BomLine.entity';
import { BomRevisionStatusHistory } from './BomRevisionStatusHistory.entity';

export {
  Bom,
  BomRevision,
  BomLine,
  BomRevisionStatusHistory,
  // Backward compatibility aliases
  Bom as BillOfMaterials,
  BomLine as BillOfMaterialLine,
  BomRevisionStatusHistory as BillOfMaterialStatusHistory,
};

export const BOMS_ENTITIES = [
  Bom,
  BomRevision,
  BomLine,
  BomRevisionStatusHistory,
];
