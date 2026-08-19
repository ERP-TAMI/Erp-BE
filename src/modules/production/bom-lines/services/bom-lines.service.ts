import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { BillOfMaterialLine } from '../../../../features/boms/entities/BillOfMaterialLine.entity';
import { CreateBomLineDto } from '../dto/request/create-bom-line.dto';
import { BomLineResponseDto } from '../dto/response/bom-line-response.dto';
import { BomLinesRepository } from '../repositories/bom-lines.repository';

@Injectable()
export class BomLinesService {
  constructor(private readonly repository: BomLinesRepository) {}

  async list(bomId: string): Promise<BomLineResponseDto[]> {
    await this.assertBomExists(bomId);
    return (await this.repository.list(bomId)).map(
      BomLineResponseDto.fromEntity,
    );
  }

  async create(
    bomId: string,
    input: CreateBomLineDto,
  ): Promise<BomLineResponseDto> {
    await this.assertBomExists(bomId);
    const material = await this.repository.findMaterial(input.materialId);
    if (!material) throw new NotFoundException('Material not found');
    if (material.status !== RecordStatus.ACTIVE) {
      throw new ConflictException('Inactive material cannot be added to a BOM');
    }
    if (!material.defaultUnit) {
      throw new ConflictException(
        'Material must have a unit before it can be added to a BOM',
      );
    }
    const lastUnitCost = Number(material.lastUnitCost);
    const line = this.repository.create({
      billOfMaterialId: bomId,
      materialId: material.id,
      materialNameSnapshot: material.materialName,
      materialGroupSnapshot: material.materialGroup?.name ?? null,
      unitSnapshot: material.defaultUnit.name,
      consumptionPerUnit: input.consumptionPerUnit,
      unitCost: input.unitCost ?? (lastUnitCost > 0 ? lastUnitCost : null),
      orderIndex: input.orderIndex,
    });
    return BomLineResponseDto.fromEntity(await this.save(line));
  }

  private async assertBomExists(id: string): Promise<void> {
    if (!(await this.repository.bomExists(id))) {
      throw new NotFoundException('BOM not found');
    }
  }

  private async save(line: BillOfMaterialLine): Promise<BillOfMaterialLine> {
    try {
      return await this.repository.save(line);
    } catch (error) {
      const code = (error as { driverError?: { code?: string } }).driverError
        ?.code;
      if (code === '23505') {
        throw new ConflictException(
          'Material or order index already exists in this BOM',
        );
      }
      throw error;
    }
  }
}
