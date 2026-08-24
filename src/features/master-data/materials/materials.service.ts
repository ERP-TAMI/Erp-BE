import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';
import { BillOfMaterialLine } from '../../boms/entities/BillOfMaterialLine.entity';
import { DraftBomLine } from '../../draft-boms/entities/DraftBomLine.entity';
import { Material } from '../entities/Material.entity';
import { MaterialGroup } from '../entities/MaterialGroup.entity';
import { MaterialSize } from '../entities/MaterialSize.entity';
import { Unit } from '../entities/Unit.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialResponseDto } from './dto/material-response.dto';
import { QueryMaterialsDto } from './dto/query-materials.dto';
import { UpdateMaterialStatusDto } from './dto/update-material-status.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(Material)
    private readonly materials: Repository<Material>,
    @InjectRepository(MaterialGroup)
    private readonly materialGroups: Repository<MaterialGroup>,
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
    @InjectRepository(MaterialSize)
    private readonly materialSizes: Repository<MaterialSize>,
    @InjectRepository(DraftBomLine)
    private readonly draftBomLines: Repository<DraftBomLine>,
    @InjectRepository(BillOfMaterialLine)
    private readonly billOfMaterialLines: Repository<BillOfMaterialLine>,
  ) {}

  async findAll(query: QueryMaterialsDto): Promise<MaterialResponseDto[]> {
    const baseWhere: FindOptionsWhere<Material> = {};
    if (query.materialGroupId) {
      baseWhere.materialGroupId = query.materialGroupId;
    }
    if (query.status) {
      baseWhere.status = query.status;
    }

    const search = query.search?.trim();
    const where: FindOptionsWhere<Material> | FindOptionsWhere<Material>[] =
      search
        ? [
            { ...baseWhere, materialCode: ILike(`%${search}%`) },
            { ...baseWhere, materialName: ILike(`%${search}%`) },
          ]
        : baseWhere;

    const materials = await this.materials.find({
      where,
      order: { materialCode: 'ASC', id: 'ASC' },
    });
    return this.mapMaterials(materials);
  }

  async findOne(id: string): Promise<MaterialResponseDto> {
    return this.mapMaterial(await this.getExistingMaterial(id));
  }

  async create(dto: CreateMaterialDto): Promise<MaterialResponseDto> {
    const materialCode = dto.materialCode;
    const materialName = dto.materialName.trim();

    const [materialGroup, defaultUnit] = await Promise.all([
      dto.materialGroupId
        ? this.getActiveMaterialGroup(dto.materialGroupId)
        : Promise.resolve(null),
      this.getActiveUnit(dto.defaultUnitId),
    ]);

    const material = this.materials.create({
      materialCode,
      materialName,
      materialGroupId: materialGroup?.id,
      defaultUnitId: defaultUnit.id,
      defaultYieldPct: this.asEntityDecimal(dto.defaultYieldPct ?? '0'),
      status: RecordStatus.ACTIVE,
    });
    const saved = await this.saveMaterial(material);
    return MaterialResponseDto.fromEntities(saved, materialGroup, defaultUnit);
  }

  async update(
    id: string,
    dto: UpdateMaterialDto,
  ): Promise<MaterialResponseDto> {
    const material = await this.getExistingMaterial(id);

    if (dto.materialName !== undefined) {
      material.materialName = dto.materialName.trim();
    }
    if (
      dto.materialGroupId !== undefined &&
      dto.materialGroupId !== material.materialGroupId
    ) {
      const materialWithNullableGroup = material as unknown as {
        materialGroupId: string | null;
      };
      materialWithNullableGroup.materialGroupId = dto.materialGroupId
        ? (await this.getActiveMaterialGroup(dto.materialGroupId)).id
        : null;
    }
    if (
      dto.defaultUnitId !== undefined &&
      dto.defaultUnitId !== material.defaultUnitId
    ) {
      material.defaultUnitId = (await this.getActiveUnit(dto.defaultUnitId)).id;
    }
    if (dto.defaultYieldPct !== undefined) {
      material.defaultYieldPct = this.asEntityDecimal(dto.defaultYieldPct);
    }

    return this.mapMaterial(await this.saveMaterial(material));
  }

  async updateStatus(
    id: string,
    dto: UpdateMaterialStatusDto,
  ): Promise<MaterialResponseDto> {
    const material = await this.getExistingMaterial(id);
    material.status = dto.status;
    return this.mapMaterial(await this.saveMaterial(material));
  }

  async remove(id: string): Promise<void> {
    const material = await this.getExistingMaterial(id);
    const referenceCounts = await Promise.all([
      this.materialSizes.countBy({ materialId: id }),
      this.draftBomLines.countBy({ materialId: id }),
      this.billOfMaterialLines.countBy({ materialId: id }),
    ]);
    if (referenceCounts.some((count) => count > 0)) {
      throw new ConflictException(
        'Material cannot be deleted because business data references it',
      );
    }

    try {
      await this.materials.remove(material);
    } catch (error) {
      if (this.hasDatabaseCode(error, '23503')) {
        throw new ConflictException(
          'Material cannot be deleted because business data references it',
        );
      }
      throw error;
    }
  }

  private async mapMaterials(
    materials: Material[],
  ): Promise<MaterialResponseDto[]> {
    const groupIds = [
      ...new Set(
        materials
          .map((material) => material.materialGroupId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const unitIds = [
      ...new Set(
        materials
          .map((material) => material.defaultUnitId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [materialGroups, units] = await Promise.all([
      groupIds.length
        ? this.materialGroups.findBy({ id: In(groupIds) })
        : Promise.resolve([]),
      unitIds.length
        ? this.units.findBy({ id: In(unitIds) })
        : Promise.resolve([]),
    ]);
    const groupsById = new Map(
      materialGroups.map((materialGroup) => [materialGroup.id, materialGroup]),
    );
    const unitsById = new Map(units.map((unit) => [unit.id, unit]));

    return materials.map((material) =>
      MaterialResponseDto.fromEntities(
        material,
        groupsById.get(material.materialGroupId) ?? null,
        unitsById.get(material.defaultUnitId) ?? null,
      ),
    );
  }

  private async mapMaterial(material: Material): Promise<MaterialResponseDto> {
    return (await this.mapMaterials([material]))[0];
  }

  private async getExistingMaterial(id: string): Promise<Material> {
    const material = await this.materials.findOneBy({ id });
    if (!material) {
      throw new NotFoundException('Material not found');
    }
    return material;
  }

  private async getActiveMaterialGroup(id: string): Promise<MaterialGroup> {
    const materialGroup = await this.materialGroups.findOneBy({ id });
    if (!materialGroup || materialGroup.status !== RecordStatus.ACTIVE) {
      throw new BadRequestException('Active material group not found');
    }
    return materialGroup;
  }

  private async getActiveUnit(id: string): Promise<Unit> {
    const unit = await this.units.findOneBy({ id });
    if (!unit || unit.status !== RecordStatus.ACTIVE) {
      throw new BadRequestException('Active default unit not found');
    }
    return unit;
  }

  private async saveMaterial(material: Material): Promise<Material> {
    try {
      return await this.materials.save(material);
    } catch (error) {
      if (this.hasDatabaseCode(error, '23505')) {
        throw new ConflictException('Material code already exists');
      }
      if (
        this.hasDatabaseCode(error, '23503') ||
        this.hasDatabaseCode(error, '23514') ||
        this.hasDatabaseCode(error, '22003')
      ) {
        throw new BadRequestException('Material data is no longer valid');
      }
      throw error;
    }
  }

  private asEntityDecimal(value: string): number {
    // PostgreSQL numeric values cross the TypeORM boundary as exact text. The
    // existing Entity property is typed as number, so keep the runtime string
    // and isolate the type mismatch here instead of losing decimal precision.
    return value as unknown as number;
  }

  private hasDatabaseCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
