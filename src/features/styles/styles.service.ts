import {
  Inject,
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
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import {
  isResolvableObjectKey,
  isObjectKeyInScope,
} from '../storage/storage-key.util';
import { DEFAULT_MAX_UPLOAD_SIZE_BYTES } from '../../common/utils/file-validation';

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
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  // baseImageKey stores an S3 object key, never a URL — a presigned URL
  // expires (PRESIGN_GET_EXPIRY_SECONDS). Service methods that read/write the
  // entity (e.g. update()) always work with the raw key; callers building an
  // API response must resolve it fresh via this method right before sending.
  async withResolvedBaseImage(style: Style): Promise<Style> {
    if (!style.baseImageKey) return style;
    // Dữ liệu cũ còn giữ đường dẫn ổ đĩa ("/uploads/style-images/..."). Ký URL
    // cho nó chỉ tạo ra link trỏ vào key không tồn tại trên S3 (và có cả dấu
    // gạch đôi), nên trả null để client hiển thị ảnh mặc định.
    if (!isResolvableObjectKey(style.baseImageKey)) {
      return { ...style, baseImageKey: null };
    }
    const baseImageKey = await this.storage.getPresignedGetUrl(
      style.baseImageKey,
    );
    return { ...style, baseImageKey };
  }

  // A client-supplied baseImageKey must be one this style's own presign
  // request produced (styles/${id}/documents/...) — otherwise any user could
  // point a style at another resource's object (cross-resource hijack) and
  // read it back via withResolvedBaseImage(). Mirrors the isObjectKeyInScope
  // check style-documents/style-sample-rounds already do at confirm().
  private async validateAndResolveBaseImageKey(
    objectKey: string | null,
    styleId: string,
  ): Promise<string | null> {
    if (!objectKey) return null;

    if (!isObjectKeyInScope(objectKey, `styles/${styleId}/`)) {
      throw new BadRequestException(
        'baseImageKey không hợp lệ cho mẫu Fit này',
      );
    }

    const head = await this.storage.headObject(objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Không tìm thấy ảnh đã tải lên, vui lòng thử tải lại',
      );
    }
    if (head.sizeBytes && head.sizeBytes > DEFAULT_MAX_UPLOAD_SIZE_BYTES) {
      await this.storage.deleteObject(objectKey);
      throw new BadRequestException(
        `Dung lượng ảnh vượt quá giới hạn ${(DEFAULT_MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB`,
      );
    }

    return objectKey;
  }

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
      // baseImageKey can only be attached via update(), once the style has
      // an id to scope the object key to — see validateAndResolveBaseImageKey.
      baseImageKey: null,
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
    if (dto.baseImageKey !== undefined) {
      style.baseImageKey = await this.validateAndResolveBaseImageKey(
        dto.baseImageKey ?? null,
        id,
      );
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
    try {
      await this.styleRepository.remove(style);
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Không thể xoá mẫu Fit vì đang được sử dụng bởi dữ liệu khác (BOM, tài liệu sản xuất...).',
        );
      }
      throw error;
    }
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
