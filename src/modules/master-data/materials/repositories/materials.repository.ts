import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Material } from '../../../../features/master-data/entities/Material.entity';
import { MaterialGroup } from '../../../../features/master-data/entities/MaterialGroup.entity';
import { Unit } from '../../../../features/master-data/entities/Unit.entity';
import { BillOfMaterialLine } from '../../../../features/boms/entities/BillOfMaterialLine.entity';
import { DraftBomLine } from '../../../../features/draft-boms/entities/DraftBomLine.entity';
import { MaterialSize } from '../../../../features/master-data/entities/MaterialSize.entity';
import { QueryMaterialsDto } from '../dto/request/query-materials.dto';

@Injectable()
export class MaterialsRepository {
  constructor(
    @InjectRepository(Material)
    private readonly materials: Repository<Material>,
    @InjectRepository(MaterialGroup)
    private readonly materialGroups: Repository<MaterialGroup>,
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
    @InjectRepository(BillOfMaterialLine)
    private readonly billOfMaterialLines: Repository<BillOfMaterialLine>,
    @InjectRepository(DraftBomLine)
    private readonly draftBomLines: Repository<DraftBomLine>,
    @InjectRepository(MaterialSize)
    private readonly materialSizes: Repository<MaterialSize>,
  ) {}
  async findAll(query: QueryMaterialsDto): Promise<Material[]> {
    const builder = this.withLookups(
      this.materials.createQueryBuilder('material'),
    )
      .orderBy('material.material_name', 'ASC')
      .addOrderBy('material.material_code', 'ASC');

    if (query.search) {
      builder.andWhere(
        "(material.material_code ILIKE :search ESCAPE '\\' OR material.material_name ILIKE :search ESCAPE '\\')",
        { search: `%${this.escapeLikePattern(query.search)}%` },
      );
    }
    if (query.materialGroupId) {
      builder.andWhere('material.material_group_id = :materialGroupId', {
        materialGroupId: query.materialGroupId,
      });
    }
    if (query.status) builder.andWhere('material.status = :status', query);

    return builder.getMany();
  }
  findById(id: string): Promise<Material | null> {
    return this.withLookups(this.materials.createQueryBuilder('material'))
      .where('material.id = :id', { id })
      .getOne();
  }
  findByCode(materialCode: string): Promise<Material | null> {
    return this.materials.findOneBy({ materialCode });
  }
  findGroupById(id: string): Promise<MaterialGroup | null> {
    return this.materialGroups.findOneBy({ id });
  }
  findUnitById(id: string): Promise<Unit | null> {
    return this.units.findOneBy({ id });
  }
  async hasReference(materialId: string): Promise<boolean> {
    const [bomCount, draftBomCount, materialSizeCount] = await Promise.all([
      this.billOfMaterialLines.countBy({ materialId }),
      this.draftBomLines.countBy({ materialId }),
      this.materialSizes.countBy({ materialId }),
    ]);
    return bomCount + draftBomCount + materialSizeCount > 0;
  }
  create(input: Partial<Material>): Material {
    return this.materials.create(input);
  }
  save(material: Material): Promise<Material> {
    return this.materials.save(material);
  }
  async remove(material: Material): Promise<void> {
    await this.materials.remove(material);
  }
  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
  }
  private withLookups(
    builder: SelectQueryBuilder<Material>,
  ): SelectQueryBuilder<Material> {
    return builder
      .leftJoinAndMapOne(
        'material.materialGroup',
        MaterialGroup,
        'materialGroup',
        'materialGroup.id = material.material_group_id',
      )
      .leftJoinAndMapOne(
        'material.defaultUnit',
        Unit,
        'defaultUnit',
        'defaultUnit.id = material.default_unit_id',
      );
  }
}
