import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Material } from '../../../../features/master-data/entities/Material.entity';
import { CreateMaterialDto } from '../dto/request/create-material.dto';
import { UpdateMaterialDto } from '../dto/request/update-material.dto';
import { UpdateMaterialStatusDto } from '../dto/request/update-material-status.dto';
import { QueryMaterialsDto } from '../dto/request/query-materials.dto';
import { MaterialResponseDto } from '../dto/response/material-response.dto';
import { MaterialsRepository } from '../repositories/materials.repository';

@Injectable()
export class MaterialsService {
  constructor(private readonly materialsRepository: MaterialsRepository) {}
  async findAll(query: QueryMaterialsDto): Promise<MaterialResponseDto[]> {
    return (await this.materialsRepository.findAll(query)).map(
      MaterialResponseDto.fromEntity,
    );
  }
  async findOne(id: string): Promise<MaterialResponseDto> {
    return MaterialResponseDto.fromEntity(await this.getExisting(id));
  }
  async create(dto: CreateMaterialDto): Promise<MaterialResponseDto> {
    const materialCode = dto.materialCode.trim().toUpperCase();
    if (await this.materialsRepository.findByCode(materialCode))
      throw new ConflictException('Material code already exists');
    if (dto.materialGroupId) await this.assertActiveGroup(dto.materialGroupId);
    await this.assertActiveUnit(dto.defaultUnitId);
    const material = this.materialsRepository.create({
      materialCode,
      materialName: dto.materialName.trim(),
      materialGroupId: dto.materialGroupId,
      defaultUnitId: dto.defaultUnitId,
      defaultYieldPct: dto.defaultYieldPct ?? 0,
      lastUnitCost: dto.lastUnitCost ?? 0,
      currentStock: dto.currentStock ?? 0,
      lowStockThreshold: dto.lowStockThreshold ?? 10,
      status: RecordStatus.ACTIVE,
    });
    return MaterialResponseDto.fromEntity(
      await this.materialsRepository.save(material),
    );
  }
  async update(
    id: string,
    dto: UpdateMaterialDto,
  ): Promise<MaterialResponseDto> {
    const material = await this.getExisting(id);
    if (dto.materialCode !== undefined) {
      const materialCode = dto.materialCode.trim().toUpperCase();
      const existing = await this.materialsRepository.findByCode(materialCode);
      if (existing && existing.id !== id)
        throw new ConflictException('Material code already exists');
      material.materialCode = materialCode;
    }
    if (dto.materialName !== undefined)
      material.materialName = dto.materialName.trim();
    if (
      dto.materialGroupId !== undefined &&
      dto.materialGroupId !== material.materialGroupId
    ) {
      await this.assertActiveGroup(dto.materialGroupId);
      material.materialGroupId = dto.materialGroupId;
    }
    if (
      dto.defaultUnitId !== undefined &&
      dto.defaultUnitId !== material.defaultUnitId
    ) {
      await this.assertActiveUnit(dto.defaultUnitId);
      material.defaultUnitId = dto.defaultUnitId;
    }
    if (dto.defaultYieldPct !== undefined)
      material.defaultYieldPct = dto.defaultYieldPct;
    if (dto.lastUnitCost !== undefined)
      material.lastUnitCost = dto.lastUnitCost;
    if (dto.currentStock !== undefined)
      material.currentStock = dto.currentStock;
    if (dto.lowStockThreshold !== undefined)
      material.lowStockThreshold = dto.lowStockThreshold;
    return MaterialResponseDto.fromEntity(
      await this.materialsRepository.save(material),
    );
  }
  async updateStatus(
    id: string,
    dto: UpdateMaterialStatusDto,
  ): Promise<MaterialResponseDto> {
    const material = await this.getExisting(id);
    material.status = dto.status;
    return MaterialResponseDto.fromEntity(
      await this.materialsRepository.save(material),
    );
  }
  async remove(id: string): Promise<void> {
    const material = await this.getExisting(id);
    if (await this.materialsRepository.hasReference(id)) {
      throw new ConflictException(
        'Material cannot be deleted because it is referenced by business data',
      );
    }
    await this.materialsRepository.remove(material);
  }
  private async getExisting(id: string): Promise<Material> {
    const material = await this.materialsRepository.findById(id);
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }
  private async assertActiveGroup(id: string): Promise<void> {
    const group = await this.materialsRepository.findGroupById(id);
    if (!group) throw new NotFoundException('Material group not found');
    if (group.status !== RecordStatus.ACTIVE)
      throw new ConflictException('Inactive material group cannot be selected');
  }
  private async assertActiveUnit(id: string): Promise<void> {
    const unit = await this.materialsRepository.findUnitById(id);
    if (!unit) throw new NotFoundException('Unit not found');
    if (unit.status !== RecordStatus.ACTIVE)
      throw new ConflictException('Inactive unit cannot be selected');
  }
}
