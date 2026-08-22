import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Material } from '../../entities/Material.entity';
import { MaterialGroup } from '../../entities/MaterialGroup.entity';

@Injectable()
export class MaterialGroupsRepository {
  constructor(
    @InjectRepository(MaterialGroup)
    private readonly materialGroups: Repository<MaterialGroup>,
    @InjectRepository(Material)
    private readonly materials: Repository<Material>,
  ) {}

  findAll(status?: RecordStatus): Promise<MaterialGroup[]> {
    return this.materialGroups.find({
      where: status ? { status } : {},
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
  }

  findById(id: string): Promise<MaterialGroup | null> {
    return this.materialGroups.findOneBy({ id });
  }

  findByCode(code: string): Promise<MaterialGroup | null> {
    return this.materialGroups.findOneBy({ code });
  }

  findByNormalizedName(name: string): Promise<MaterialGroup | null> {
    return this.materialGroups
      .createQueryBuilder('materialGroup')
      .where('LOWER(BTRIM(materialGroup.name)) = LOWER(BTRIM(:name))', { name })
      .getOne();
  }

  async hasMaterialReference(materialGroupId: string): Promise<boolean> {
    return (await this.materials.countBy({ materialGroupId })) > 0;
  }

  create(input: Partial<MaterialGroup>): MaterialGroup {
    return this.materialGroups.create(input);
  }

  save(materialGroup: MaterialGroup): Promise<MaterialGroup> {
    return this.materialGroups.save(materialGroup);
  }

  remove(materialGroup: MaterialGroup): Promise<MaterialGroup> {
    return this.materialGroups.remove(materialGroup);
  }
}
