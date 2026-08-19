import { BillOfMaterialLine } from '../../../../../features/boms/entities/BillOfMaterialLine.entity';

export class BomLineResponseDto {
  id: string;
  billOfMaterialId: string;
  materialId: string;
  materialNameSnapshot: string;
  materialGroupSnapshot: string | null;
  unitSnapshot: string;
  consumptionPerUnit: number;
  unitCost: number | null;
  orderIndex: number;

  static fromEntity(line: BillOfMaterialLine): BomLineResponseDto {
    return {
      id: line.id,
      billOfMaterialId: line.billOfMaterialId,
      materialId: line.materialId,
      materialNameSnapshot: line.materialNameSnapshot,
      materialGroupSnapshot: line.materialGroupSnapshot ?? null,
      unitSnapshot: line.unitSnapshot,
      consumptionPerUnit: Number(line.consumptionPerUnit),
      unitCost: line.unitCost == null ? null : Number(line.unitCost),
      orderIndex: line.orderIndex,
    };
  }
}
