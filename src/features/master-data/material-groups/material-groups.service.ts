import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';
import { Material } from '../entities/Material.entity';
import { MaterialGroup } from '../entities/MaterialGroup.entity';
import { CreateMaterialGroupDto } from './dto/create-material-group.dto';
import { MaterialGroupResponseDto } from './dto/material-group-response.dto';
import { QueryMaterialGroupsDto } from './dto/query-material-groups.dto';
import { UpdateMaterialGroupStatusDto } from './dto/update-material-group-status.dto';
import { UpdateMaterialGroupDto } from './dto/update-material-group.dto';

@Injectable()
export class MaterialGroupsService {
  constructor(
    @InjectRepository(MaterialGroup)
    private readonly materialGroups: Repository<MaterialGroup>,
    @InjectRepository(Material)
    private readonly materials: Repository<Material>,
  ) {}

  async findAll(
    query: QueryMaterialGroupsDto,
  ): Promise<MaterialGroupResponseDto[]> {
    const materialGroups = await this.materialGroups.find({
      where: query.status ? { status: query.status } : {},
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
    return materialGroups.map(MaterialGroupResponseDto.fromEntity);
  }

  async findOne(id: string): Promise<MaterialGroupResponseDto> {
    return MaterialGroupResponseDto.fromEntity(await this.getExistingGroup(id));
  }

  async create(dto: CreateMaterialGroupDto): Promise<MaterialGroupResponseDto> {
    const code = dto.code
      ? this.normalizeCode(dto.code)
      : this.generateInternalCode();
    const name = this.normalizeName(dto.name);
    await this.ensureUnique(code, name);

    const materialGroup = this.materialGroups.create({
      code,
      name,
      displayOrder: dto.displayOrder ?? 0,
      status: RecordStatus.ACTIVE,
    });
    return MaterialGroupResponseDto.fromEntity(
      await this.saveWithUniqueConflict(materialGroup),
    );
  }

  async update(
    id: string,
    dto: UpdateMaterialGroupDto,
  ): Promise<MaterialGroupResponseDto> {
    const materialGroup = await this.getExistingGroup(id);
    const code =
      dto.code === undefined ? undefined : this.normalizeCode(dto.code);
    const name =
      dto.name === undefined ? undefined : this.normalizeName(dto.name);

    if (code && code !== materialGroup.code) {
      await this.ensureCodeUnique(code, id);
      materialGroup.code = code;
    }

    if (name && name !== materialGroup.name) {
      await this.ensureNameUnique(name, id);
      materialGroup.name = name;
    }

    if (dto.displayOrder !== undefined) {
      materialGroup.displayOrder = dto.displayOrder;
    }

    return MaterialGroupResponseDto.fromEntity(
      await this.saveWithUniqueConflict(materialGroup),
    );
  }

  async updateStatus(
    id: string,
    dto: UpdateMaterialGroupStatusDto,
  ): Promise<MaterialGroupResponseDto> {
    const materialGroup = await this.getExistingGroup(id);
    materialGroup.status = dto.status;
    return MaterialGroupResponseDto.fromEntity(
      await this.saveWithUniqueConflict(materialGroup),
    );
  }

  async remove(id: string): Promise<void> {
    const materialGroup = await this.getExistingGroup(id);
    if ((await this.materials.countBy({ materialGroupId: id })) > 0) {
      throw new ConflictException(
        'Material group cannot be deleted because materials reference it',
      );
    }
    try {
      await this.materialGroups.remove(materialGroup);
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Material group cannot be deleted because it is referenced by business data',
        );
      }
      throw error;
    }
  }

  private async getExistingGroup(id: string): Promise<MaterialGroup> {
    const materialGroup = await this.materialGroups.findOneBy({ id });
    if (!materialGroup) {
      throw new NotFoundException('Material group not found');
    }
    return materialGroup;
  }

  private async ensureUnique(code: string, name: string): Promise<void> {
    await this.ensureCodeUnique(code);
    await this.ensureNameUnique(name);
  }

  private async ensureCodeUnique(
    code: string,
    ignoredId?: string,
  ): Promise<void> {
    const existing = await this.materialGroups.findOneBy({ code });
    if (existing && existing.id !== ignoredId) {
      throw new ConflictException('Material group code already exists');
    }
  }

  private async ensureNameUnique(
    name: string,
    ignoredId?: string,
  ): Promise<void> {
    const existing = await this.materialGroups
      .createQueryBuilder('materialGroup')
      .where('LOWER(BTRIM(materialGroup.name)) = LOWER(BTRIM(:name))', { name })
      .getOne();
    if (existing && existing.id !== ignoredId) {
      throw new ConflictException('Material group name already exists');
    }
  }

  private async saveWithUniqueConflict(
    materialGroup: MaterialGroup,
  ): Promise<MaterialGroup> {
    try {
      return await this.materialGroups.save(materialGroup);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Material group code or name already exists',
        );
      }
      throw error;
    }
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private normalizeName(name: string): string {
    return name.trim();
  }

  private generateInternalCode(): string {
    return `MG-${randomUUID().replaceAll('-', '').toUpperCase()}`;
  }

  private isUniqueViolation(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    );
  }

  private isForeignKeyViolation(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23503'
    );
  }
}
