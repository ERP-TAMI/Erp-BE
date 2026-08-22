import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { MaterialGroup } from '../../entities/MaterialGroup.entity';
import { CreateMaterialGroupDto } from '../dto/request/create-material-group.dto';
import { QueryMaterialGroupsDto } from '../dto/request/query-material-groups.dto';
import { UpdateMaterialGroupDto } from '../dto/request/update-material-group.dto';
import { UpdateMaterialGroupStatusDto } from '../dto/request/update-material-group-status.dto';
import { MaterialGroupResponseDto } from '../dto/response/material-group-response.dto';
import { MaterialGroupsRepository } from '../repositories/material-groups.repository';

@Injectable()
export class MaterialGroupsService {
  constructor(
    private readonly materialGroupsRepository: MaterialGroupsRepository,
  ) {}

  async findAll(
    query: QueryMaterialGroupsDto,
  ): Promise<MaterialGroupResponseDto[]> {
    const materialGroups = await this.materialGroupsRepository.findAll(
      query.status,
    );
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

    const materialGroup = this.materialGroupsRepository.create({
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
      if (await this.materialGroupsRepository.hasMaterialReference(id)) {
        throw new ConflictException(
          'Material group code cannot be changed after materials reference this group',
        );
      }
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
    if (await this.materialGroupsRepository.hasMaterialReference(id)) {
      throw new ConflictException(
        'Material group cannot be deleted because materials reference it',
      );
    }
    try {
      await this.materialGroupsRepository.remove(materialGroup);
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
    const materialGroup = await this.materialGroupsRepository.findById(id);
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
    const existing = await this.materialGroupsRepository.findByCode(code);
    if (existing && existing.id !== ignoredId) {
      throw new ConflictException('Material group code already exists');
    }
  }

  private async ensureNameUnique(
    name: string,
    ignoredId?: string,
  ): Promise<void> {
    const existing =
      await this.materialGroupsRepository.findByNormalizedName(name);
    if (existing && existing.id !== ignoredId) {
      throw new ConflictException('Material group name already exists');
    }
  }

  private async saveWithUniqueConflict(
    materialGroup: MaterialGroup,
  ): Promise<MaterialGroup> {
    try {
      return await this.materialGroupsRepository.save(materialGroup);
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
