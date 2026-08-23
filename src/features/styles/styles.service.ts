import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Style } from './entities/Style.entity';
import { StyleStatus } from '../../common/enums/database.enums';
import { CreateStyleDto, UpdateStyleDto, StyleQueryDto } from './dto';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class StylesService {
  constructor(
    @InjectRepository(Style)
    private readonly styleRepository: Repository<Style>,
  ) {}

  async create(dto: CreateStyleDto, userId?: string): Promise<Style> {
    const styleCodeClean = dto.styleCode?.trim();
    if (!styleCodeClean) {
      throw new BadRequestException('Mã mẫu Fit không được để trống');
    }

    const styleNameClean = dto.styleName?.trim();
    if (!styleNameClean) {
      throw new BadRequestException('Tên mẫu Fit không được để trống');
    }

    const existing = await this.styleRepository.findOne({
      where: { styleCode: styleCodeClean },
    });

    if (existing) {
      throw new ConflictException(
        `Mã mẫu Fit "${styleCodeClean}" đã tồn tại trong hệ thống`,
      );
    }

    const style = this.styleRepository.create({
      styleCode: styleCodeClean,
      styleName: styleNameClean,
      description: dto.description?.trim() ?? null,
      category: dto.category?.trim() ?? null,
      baseImageVersionId: dto.baseImageVersionId ?? null,
      status: dto.status ?? StyleStatus.DRAFT,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    return this.styleRepository.save(style);
  }

  async findAll(query: StyleQueryDto): Promise<PaginatedResult<Style>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.styleRepository.createQueryBuilder('style');

    if (query.search?.trim()) {
      const searchPattern = `%${query.search.trim()}%`;
      qb.andWhere(
        '(style.style_code ILIKE :search OR style.style_name ILIKE :search)',
        { search: searchPattern },
      );
    }

    if (query.category?.trim()) {
      qb.andWhere('style.category = :category', {
        category: query.category.trim(),
      });
    }

    if (query.status) {
      qb.andWhere('style.status = :status', { status: query.status });
    }

    qb.orderBy('style.created_at', 'DESC').addOrderBy('style.id', 'DESC');

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findOne(id: string): Promise<Style> {
    const style = await this.styleRepository.findOne({ where: { id } });
    if (!style) {
      throw new NotFoundException(`Không tìm thấy mẫu Fit với ID: ${id}`);
    }
    return style;
  }

  async findByCode(styleCode: string): Promise<Style> {
    const style = await this.styleRepository.findOne({
      where: { styleCode: styleCode.trim() },
    });
    if (!style) {
      throw new NotFoundException(
        `Không tìm thấy mẫu Fit với mã: ${styleCode}`,
      );
    }
    return style;
  }

  async update(
    id: string,
    dto: UpdateStyleDto,
    userId?: string,
  ): Promise<Style> {
    const style = await this.findOne(id);

    if (dto.styleCode !== undefined) {
      const codeClean = dto.styleCode.trim();
      if (!codeClean) {
        throw new BadRequestException('Mã mẫu Fit không được để trống');
      }
      if (codeClean !== style.styleCode) {
        const existing = await this.styleRepository.findOne({
          where: { styleCode: codeClean },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException(
            `Mã mẫu Fit "${codeClean}" đã tồn tại trong hệ thống`,
          );
        }
        style.styleCode = codeClean;
      }
    }

    if (dto.styleName !== undefined) {
      const styleNameClean = dto.styleName.trim();
      if (!styleNameClean) {
        throw new BadRequestException('Tên mẫu Fit không được để trống');
      }
      style.styleName = styleNameClean;
    }
    if (dto.description !== undefined) {
      style.description = dto.description?.trim() ?? null;
    }
    if (dto.category !== undefined) {
      style.category = dto.category?.trim() ?? null;
    }
    if (dto.baseImageVersionId !== undefined) {
      style.baseImageVersionId = dto.baseImageVersionId ?? null;
    }
    if (dto.status !== undefined) {
      style.status = dto.status;
    }

    style.updatedBy = userId ?? null;
    style.rowVersion = Number(style.rowVersion) + 1;

    return this.styleRepository.save(style);
  }

  async remove(id: string): Promise<void> {
    const style = await this.findOne(id);
    await this.styleRepository.remove(style);
  }
}
