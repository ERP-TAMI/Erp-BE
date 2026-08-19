import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';
import { Material } from '../../../features/master-data/entities/Material.entity';
import { MaterialSize } from '../../../features/master-data/entities/MaterialSize.entity';

@Injectable()
export class MaterialSizesService {
  constructor(
    @InjectRepository(Material)
    private readonly materials: Repository<Material>,
    @InjectRepository(MaterialSize)
    private readonly sizes: Repository<MaterialSize>,
  ) {}
  async list(materialId: string) {
    await this.ensureMaterial(materialId);
    return this.sizes.find({
      where: { materialId },
      order: { sizeCode: 'ASC' },
    });
  }
  async create(materialId: string, input: Partial<MaterialSize>) {
    await this.ensureMaterial(materialId);
    const sizeCode = input.sizeCode!.trim().toUpperCase();
    if (await this.sizes.findOneBy({ materialId, sizeCode }))
      throw new ConflictException('Material size already exists');
    return this.sizes.save(
      this.sizes.create({
        materialId,
        sizeCode,
        barcode: input.barcode?.trim() || undefined,
        unitCost: input.unitCost ?? 0,
        currentStock: input.currentStock ?? 0,
        lowStockThreshold: input.lowStockThreshold ?? 10,
        status: RecordStatus.ACTIVE,
      }),
    );
  }
  async update(materialId: string, id: string, input: Partial<MaterialSize>) {
    const size = await this.ensureSize(materialId, id);
    if (input.sizeCode) {
      const sizeCode = input.sizeCode.trim().toUpperCase();
      if (
        sizeCode !== size.sizeCode &&
        (await this.sizes.findOneBy({ materialId, sizeCode }))
      )
        throw new ConflictException('Material size already exists');
      size.sizeCode = sizeCode;
    }
    Object.assign(size, {
      ...input,
      barcode:
        input.barcode === undefined
          ? size.barcode
          : input.barcode?.trim() || undefined,
    });
    return this.sizes.save(size);
  }
  async updateStatus(materialId: string, id: string, status: RecordStatus) {
    const size = await this.ensureSize(materialId, id);
    size.status = status;
    return this.sizes.save(size);
  }
  async remove(materialId: string, id: string) {
    await this.sizes.remove(await this.ensureSize(materialId, id));
  }
  private async ensureMaterial(id: string) {
    if (!(await this.materials.findOneBy({ id })))
      throw new NotFoundException('Material not found');
  }
  private async ensureSize(materialId: string, id: string) {
    const size = await this.sizes.findOneBy({ id, materialId });
    if (!size) throw new NotFoundException('Material size not found');
    return size;
  }
}
