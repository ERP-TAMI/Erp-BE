import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Material } from '../../../../features/master-data/entities/Material.entity';
import { MaterialSize } from '../../../../features/master-data/entities/MaterialSize.entity';

@Injectable()
export class MaterialSizesRepository {
  constructor(
    @InjectRepository(Material)
    private readonly materials: Repository<Material>,
    @InjectRepository(MaterialSize)
    private readonly sizes: Repository<MaterialSize>,
  ) {}

  async materialExists(id: string): Promise<boolean> {
    return this.materials.existsBy({ id });
  }

  findAll(materialId: string): Promise<MaterialSize[]> {
    return this.sizes.find({
      where: { materialId },
      order: { sizeCode: 'ASC' },
    });
  }

  findById(materialId: string, id: string): Promise<MaterialSize | null> {
    return this.sizes.findOneBy({ id, materialId });
  }

  findByCode(
    materialId: string,
    sizeCode: string,
  ): Promise<MaterialSize | null> {
    return this.sizes.findOneBy({ materialId, sizeCode });
  }

  create(input: DeepPartial<MaterialSize>): MaterialSize {
    return this.sizes.create(input);
  }

  save(size: MaterialSize): Promise<MaterialSize> {
    return this.sizes.save(size);
  }

  async remove(size: MaterialSize): Promise<void> {
    await this.sizes.remove(size);
  }
}
