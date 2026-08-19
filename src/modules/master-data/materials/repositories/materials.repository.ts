import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material } from '../../../../features/master-data/entities/Material.entity';
import { MaterialGroup } from '../../../../features/master-data/entities/MaterialGroup.entity';

@Injectable()
export class MaterialsRepository {
  constructor(
    @InjectRepository(Material)
    private readonly materials: Repository<Material>,
    @InjectRepository(MaterialGroup)
    private readonly materialGroups: Repository<MaterialGroup>,
  ) {}
  findAll(): Promise<Material[]> {
    return this.materials.find({ order: { materialName: 'ASC' } });
  }
  findById(id: string): Promise<Material | null> {
    return this.materials.findOneBy({ id });
  }
  findByCode(materialCode: string): Promise<Material | null> {
    return this.materials.findOneBy({ materialCode });
  }
  findGroupById(id: string): Promise<MaterialGroup | null> {
    return this.materialGroups.findOneBy({ id });
  }
  create(input: Partial<Material>): Material {
    return this.materials.create(input);
  }
  save(material: Material): Promise<Material> {
    return this.materials.save(material);
  }
}
