import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';
import { Workshop } from '../entities/Workshop.entity';
import { CreateWorkshopDto } from './dto/create-workshop.dto';
import { QueryWorkshopsDto } from './dto/query-workshops.dto';
import { UpdateWorkshopStatusDto } from './dto/update-workshop-status.dto';
import { UpdateWorkshopDto } from './dto/update-workshop.dto';
import { WorkshopResponseDto } from './dto/workshop-response.dto';

@Injectable()
export class WorkshopsService {
  constructor(
    @InjectRepository(Workshop)
    private readonly workshops: Repository<Workshop>,
  ) {}

  async findAll(query: QueryWorkshopsDto): Promise<WorkshopResponseDto[]> {
    const baseWhere: FindOptionsWhere<Workshop> = query.status
      ? { status: query.status }
      : {};
    const search = query.search?.trim();
    const where: FindOptionsWhere<Workshop> | FindOptionsWhere<Workshop>[] =
      search
        ? [
            { ...baseWhere, workshopCode: ILike(`%${search}%`) },
            { ...baseWhere, name: ILike(`%${search}%`) },
            { ...baseWhere, manager: ILike(`%${search}%`) },
          ]
        : baseWhere;
    const workshops = await this.workshops.find({
      where,
      order: { workshopCode: 'ASC', id: 'ASC' },
    });
    return workshops.map(WorkshopResponseDto.fromEntity);
  }

  async findOne(id: string): Promise<WorkshopResponseDto> {
    return WorkshopResponseDto.fromEntity(await this.getExistingWorkshop(id));
  }

  async create(dto: CreateWorkshopDto): Promise<WorkshopResponseDto> {
    const workshopCode = this.normalizeCode(dto.workshopCode);
    await this.ensureCodeUnique(workshopCode);
    const workshop = this.workshops.create({
      workshopCode,
      name: dto.name.trim(),
      manager: this.normalizeNullableText(dto.manager),
      location: this.normalizeNullableText(dto.location),
      dailyCapacity: dto.capacity ?? 0,
      status: RecordStatus.ACTIVE,
    });
    const savedWorkshop = await this.saveWorkshop(workshop);
    return WorkshopResponseDto.fromEntity(
      await this.getExistingWorkshop(savedWorkshop.id),
    );
  }

  async update(
    id: string,
    dto: UpdateWorkshopDto,
  ): Promise<WorkshopResponseDto> {
    const workshop = await this.getExistingWorkshop(id);
    if (dto.workshopCode !== undefined) {
      const workshopCode = this.normalizeCode(dto.workshopCode);
      if (workshopCode !== this.normalizeCode(workshop.workshopCode)) {
        await this.ensureCodeUnique(workshopCode, workshop.id);
        workshop.workshopCode = workshopCode;
      }
    }
    if (dto.name !== undefined) workshop.name = dto.name.trim();
    if (dto.manager !== undefined) {
      workshop.manager = this.normalizeNullableText(dto.manager);
    }
    if (dto.location !== undefined) {
      workshop.location = this.normalizeNullableText(dto.location);
    }
    if (dto.capacity !== undefined) workshop.dailyCapacity = dto.capacity;
    return WorkshopResponseDto.fromEntity(await this.saveWorkshop(workshop));
  }

  async updateStatus(
    id: string,
    dto: UpdateWorkshopStatusDto,
  ): Promise<WorkshopResponseDto> {
    const workshop = await this.getExistingWorkshop(id);
    workshop.status = dto.status;
    return WorkshopResponseDto.fromEntity(await this.saveWorkshop(workshop));
  }

  async remove(id: string): Promise<void> {
    const workshop = await this.getExistingWorkshop(id);
    try {
      await this.workshops.remove(workshop);
    } catch (error) {
      if (this.hasDatabaseCode(error, '23503')) {
        throw new ConflictException(
          'Workshop cannot be deleted because it is referenced by business data',
        );
      }
      throw error;
    }
  }

  private async getExistingWorkshop(id: string): Promise<Workshop> {
    const workshop = await this.workshops.findOneBy({ id });
    if (!workshop) throw new NotFoundException('Workshop not found');
    return workshop;
  }

  private async ensureCodeUnique(
    workshopCode: string,
    excludedWorkshopId?: string,
  ): Promise<void> {
    const existing = await this.workshops
      .createQueryBuilder('workshop')
      .where('UPPER(BTRIM(workshop.workshopCode)) = :workshopCode', {
        workshopCode,
      })
      .getOne();
    if (existing && existing.id !== excludedWorkshopId) {
      throw new ConflictException('Workshop code already exists');
    }
  }

  private async saveWorkshop(workshop: Workshop): Promise<Workshop> {
    try {
      return await this.workshops.save(workshop);
    } catch (error) {
      if (this.hasDatabaseCode(error, '23505')) {
        throw new ConflictException('Workshop code already exists');
      }
      throw error;
    }
  }

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private normalizeNullableText(value?: string | null): string {
    return (value?.trim() || null) as unknown as string;
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
