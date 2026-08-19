import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { MaterialSize } from '../../../../features/master-data/entities/MaterialSize.entity';
import { CreateMaterialSizeDto } from '../dto/request/create-material-size.dto';
import { UpdateMaterialSizeDto } from '../dto/request/update-material-size.dto';
import { MaterialSizeResponseDto } from '../dto/response/material-size-response.dto';
import { MaterialSizeReferenceMap } from '../repositories/material-size-reference-map';
import { MaterialSizesRepository } from '../repositories/material-sizes.repository';

@Injectable()
export class MaterialSizesService {
  constructor(
    private readonly repository: MaterialSizesRepository,
    private readonly referenceMap: MaterialSizeReferenceMap,
  ) {}

  async list(materialId: string): Promise<MaterialSizeResponseDto[]> {
    await this.ensureMaterial(materialId);
    return (await this.repository.findAll(materialId)).map(
      MaterialSizeResponseDto.fromEntity,
    );
  }

  async create(
    materialId: string,
    input: CreateMaterialSizeDto,
  ): Promise<MaterialSizeResponseDto> {
    await this.ensureMaterial(materialId);
    const sizeCode = this.normalizeSizeCode(input.sizeCode);
    await this.assertUnique(materialId, sizeCode);
    const size = this.repository.create({
      materialId,
      sizeCode,
      barcode: this.normalizeBarcode(input.barcode) ?? undefined,
      unitCost: input.unitCost ?? 0,
      currentStock: input.currentStock ?? 0,
      lowStockThreshold: input.lowStockThreshold ?? 10,
      status: RecordStatus.ACTIVE,
    });
    return MaterialSizeResponseDto.fromEntity(await this.save(size));
  }

  async update(
    materialId: string,
    id: string,
    input: UpdateMaterialSizeDto,
  ): Promise<MaterialSizeResponseDto> {
    const size = await this.ensureSize(materialId, id);
    if (input.sizeCode !== undefined) {
      const sizeCode = this.normalizeSizeCode(input.sizeCode);
      if (sizeCode !== size.sizeCode) {
        await this.assertUnique(materialId, sizeCode);
        size.sizeCode = sizeCode;
      }
    }
    if (input.barcode !== undefined) {
      size.barcode = this.normalizeBarcode(input.barcode) as unknown as string;
    }
    if (input.unitCost !== undefined) size.unitCost = input.unitCost;
    if (input.currentStock !== undefined)
      size.currentStock = input.currentStock;
    if (input.lowStockThreshold !== undefined)
      size.lowStockThreshold = input.lowStockThreshold;
    return MaterialSizeResponseDto.fromEntity(await this.save(size));
  }

  async updateStatus(
    materialId: string,
    id: string,
    status: RecordStatus,
  ): Promise<MaterialSizeResponseDto> {
    const size = await this.ensureSize(materialId, id);
    size.status = status;
    return MaterialSizeResponseDto.fromEntity(await this.save(size));
  }

  async remove(materialId: string, id: string): Promise<void> {
    const size = await this.ensureSize(materialId, id);
    if (await this.referenceMap.hasReference(size.id)) {
      throw new ConflictException(
        'Material size cannot be deleted because it is referenced',
      );
    }
    await this.repository.remove(size);
  }

  private async ensureMaterial(id: string): Promise<void> {
    if (!(await this.repository.materialExists(id))) {
      throw new NotFoundException('Material not found');
    }
  }

  private async ensureSize(
    materialId: string,
    id: string,
  ): Promise<MaterialSize> {
    const size = await this.repository.findById(materialId, id);
    if (!size) throw new NotFoundException('Material size not found');
    return size;
  }

  private async assertUnique(
    materialId: string,
    sizeCode: string,
  ): Promise<void> {
    if (await this.repository.findByCode(materialId, sizeCode)) {
      throw new ConflictException('Material size already exists');
    }
  }

  private normalizeSizeCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private normalizeBarcode(value?: string | null): string | null {
    return value?.trim() || null;
  }

  private async save(size: MaterialSize): Promise<MaterialSize> {
    try {
      return await this.repository.save(size);
    } catch (error) {
      const code = (error as { driverError?: { code?: string } }).driverError
        ?.code;
      if (code === '23505') {
        throw new ConflictException('Material size already exists');
      }
      throw error;
    }
  }
}
