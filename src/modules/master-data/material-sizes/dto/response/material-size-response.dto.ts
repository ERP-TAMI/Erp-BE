import { RecordStatus } from '../../../../../common/enums/database.enums';
import { MaterialSize } from '../../../../../features/master-data/entities/MaterialSize.entity';

export class MaterialSizeResponseDto {
  id: string;
  materialId: string;
  sizeCode: string;
  barcode: string | null;
  unitCost: number;
  currentStock: number;
  lowStockThreshold: number;
  status: RecordStatus;

  static fromEntity(size: MaterialSize): MaterialSizeResponseDto {
    return {
      id: size.id,
      materialId: size.materialId,
      sizeCode: size.sizeCode,
      barcode: size.barcode ?? null,
      unitCost: Number(size.unitCost),
      currentStock: Number(size.currentStock),
      lowStockThreshold: Number(size.lowStockThreshold),
      status: size.status,
    };
  }
}
