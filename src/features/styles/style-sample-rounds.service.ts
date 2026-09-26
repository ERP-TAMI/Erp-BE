import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { Style } from './entities/Style.entity';
import { StyleSampleRound } from './entities/StyleSampleRound.entity';
import { StyleSampleImage } from './entities/StyleSampleImage.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { SampleStatus, UploadStatus } from '../../common/enums/database.enums';
import { assertAllowedFile } from '../../common/utils/file-validation';
import {
  PRESIGN_GET_EXPIRY_SECONDS,
  PRESIGN_PUT_EXPIRY_SECONDS,
  STORAGE_SERVICE,
  StorageService,
} from '../storage/storage.interface';
import {
  isDuplicateStorageKeyError,
  isObjectKeyInScope,
} from '../storage/storage-key.util';
import {
  CreateStyleSampleRoundDto,
  UpdateStyleSampleRoundDto,
  PresignStyleSampleImageDto,
  ConfirmStyleSampleImageDto,
} from './dto/style-sample-round.dto';

const SAMPLE_IMAGE_ALLOWLIST: Record<string, string[]> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
};
const MAX_SAMPLE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface StyleSampleImageItem {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  orderIndex: number;
  uploadedAt: Date;
}

export interface StyleSampleRoundItem {
  id: string;
  roundNo: number;
  sampleDate: Date | null;
  feedback: string | null;
  status: SampleStatus;
  createdBy: string | null;
  createdAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  images: StyleSampleImageItem[];
}

export interface PresignStyleSampleImageResult {
  objectKey: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface StyleSampleImageDownloadUrlResult {
  url: string;
  expiresIn: number;
}

interface RawSampleImageRow {
  id: string;
  sampleRoundId: string;
  orderIndex: number;
  storageKey: string;
  fileName: string;
  mimeType: string;
  uploadedAt: Date;
}

@Injectable()
export class StyleSampleRoundsService {
  constructor(
    @InjectRepository(Style)
    private readonly styleRepo: Repository<Style>,
    @InjectRepository(StyleSampleRound)
    private readonly roundRepo: Repository<StyleSampleRound>,
    @InjectRepository(StyleSampleImage)
    private readonly imageRepo: Repository<StyleSampleImage>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  private async assertStyleExists(styleId: string): Promise<void> {
    const exists = await this.styleRepo.exist({ where: { id: styleId } });
    if (!exists) {
      throw new NotFoundException(`Không tìm thấy mẫu Fit với ID: ${styleId}`);
    }
  }

  private async findRoundOrThrow(
    styleId: string,
    roundId: string,
  ): Promise<StyleSampleRound> {
    const round = await this.roundRepo.findOne({
      where: { id: roundId, styleId },
    });
    if (!round) {
      throw new NotFoundException(`Không tìm thấy lần may mẫu #${roundId}`);
    }
    return round;
  }

  private async mapImagesByRound(
    roundIds: string[],
  ): Promise<Map<string, StyleSampleImageItem[]>> {
    const map = new Map<string, StyleSampleImageItem[]>();
    if (roundIds.length === 0) return map;

    const rows = await this.imageRepo
      .createQueryBuilder('img')
      .innerJoin(DocumentVersion, 'v', 'v.id = img.documentVersionId')
      .where('img.sampleRoundId IN (:...roundIds)', { roundIds })
      .select('img.id', 'id')
      .addSelect('img.sampleRoundId', 'sampleRoundId')
      .addSelect('img.orderIndex', 'orderIndex')
      .addSelect('v.storageKey', 'storageKey')
      .addSelect('v.originalFileName', 'fileName')
      .addSelect('v.mimeType', 'mimeType')
      .addSelect('v.uploadedAt', 'uploadedAt')
      .orderBy('img.orderIndex', 'ASC')
      .getRawMany<RawSampleImageRow>();

    const withUrls = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        url: await this.storage.getPresignedGetUrl(
          row.storageKey,
          PRESIGN_GET_EXPIRY_SECONDS,
        ),
      })),
    );

    for (const row of withUrls) {
      const list = map.get(row.sampleRoundId) || [];
      list.push({
        id: row.id,
        url: row.url,
        fileName: row.fileName,
        mimeType: row.mimeType,
        orderIndex: row.orderIndex,
        uploadedAt: row.uploadedAt,
      });
      map.set(row.sampleRoundId, list);
    }
    return map;
  }

  private toItem(
    round: StyleSampleRound,
    images: StyleSampleImageItem[],
  ): StyleSampleRoundItem {
    return {
      id: round.id,
      roundNo: round.roundNo,
      sampleDate: round.sampleDate,
      feedback: round.feedback,
      status: round.status,
      createdBy: round.createdBy,
      createdAt: round.createdAt,
      reviewedBy: round.reviewedBy,
      reviewedAt: round.reviewedAt,
      images,
    };
  }

  async list(styleId: string): Promise<StyleSampleRoundItem[]> {
    await this.assertStyleExists(styleId);

    const rounds = await this.roundRepo.find({
      where: { styleId },
      order: { roundNo: 'DESC' },
    });
    if (rounds.length === 0) return [];

    const imagesMap = await this.mapImagesByRound(rounds.map((r) => r.id));
    return rounds.map((round) =>
      this.toItem(round, imagesMap.get(round.id) || []),
    );
  }

  async create(
    styleId: string,
    dto: CreateStyleSampleRoundDto,
    userId?: string,
  ): Promise<StyleSampleRoundItem> {
    await this.assertStyleExists(styleId);

    const status = dto.status || SampleStatus.WORKING;
    const isReviewed = status !== SampleStatus.WORKING;

    const currentCount = await this.roundRepo.count({ where: { styleId } });
    const round = this.roundRepo.create({
      styleId,
      roundNo: currentCount + 1,
      sampleDate: dto.sampleDate ? new Date(dto.sampleDate) : new Date(),
      feedback: dto.feedback || null,
      status,
      createdBy: userId,
      createdAt: new Date(),
      reviewedBy: isReviewed ? userId : null,
      reviewedAt: isReviewed ? new Date() : null,
    });
    const saved = await this.roundRepo.save(round);
    return this.toItem(saved, []);
  }

  async update(
    styleId: string,
    roundId: string,
    dto: UpdateStyleSampleRoundDto,
    userId?: string,
  ): Promise<StyleSampleRoundItem> {
    await this.assertStyleExists(styleId);
    const round = await this.findRoundOrThrow(styleId, roundId);

    if (dto.sampleDate !== undefined) {
      round.sampleDate = new Date(dto.sampleDate);
    }
    if (dto.feedback !== undefined) {
      round.feedback = dto.feedback;
    }
    if (dto.status !== undefined && dto.status !== round.status) {
      round.status = dto.status;
      if (dto.status === SampleStatus.WORKING) {
        round.reviewedBy = null;
        round.reviewedAt = null;
      } else {
        round.reviewedBy = userId ?? null;
        round.reviewedAt = new Date();
      }
    }

    const saved = await this.roundRepo.save(round);
    const imagesMap = await this.mapImagesByRound([roundId]);
    return this.toItem(saved, imagesMap.get(roundId) || []);
  }

  async presignImage(
    styleId: string,
    roundId: string,
    dto: PresignStyleSampleImageDto,
  ): Promise<PresignStyleSampleImageResult> {
    await this.assertStyleExists(styleId);
    await this.findRoundOrThrow(styleId, roundId);
    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes, {
      allowlist: SAMPLE_IMAGE_ALLOWLIST,
      maxSizeBytes: MAX_SAMPLE_IMAGE_SIZE_BYTES,
    });

    const ext = extname(dto.fileName).toLowerCase();
    const objectKey = `styles/${styleId}/sample-rounds/${roundId}/images/${randomUUID()}${ext}`;

    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      dto.mimeType,
      PRESIGN_PUT_EXPIRY_SECONDS,
    );

    return { objectKey, uploadUrl, expiresIn: PRESIGN_PUT_EXPIRY_SECONDS };
  }

  async confirmImage(
    styleId: string,
    roundId: string,
    userId: string | undefined,
    dto: ConfirmStyleSampleImageDto,
  ): Promise<StyleSampleImageItem> {
    await this.assertStyleExists(styleId);
    await this.findRoundOrThrow(styleId, roundId);

    if (
      !isObjectKeyInScope(
        dto.objectKey,
        `styles/${styleId}/sample-rounds/${roundId}/images/`,
      )
    ) {
      throw new BadRequestException(
        'objectKey không thuộc phạm vi tải lên này, vui lòng lấy lại link upload.',
      );
    }

    const head = await this.storage.headObject(dto.objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Ảnh chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }

    const now = new Date();

    return this.dataSource
      .transaction(async (manager) => {
        const docRepo = manager.getRepository(Document);
        const versionRepo = manager.getRepository(DocumentVersion);
        const imageRepo = manager.getRepository(StyleSampleImage);

        const doc = await docRepo.save(
          docRepo.create({
            title: dto.fileName,
            createdBy: userId || (null as any),
            createdAt: now,
          }),
        );

        const version = await versionRepo.save(
          versionRepo.create({
            documentId: doc.id,
            versionNo: 1,
            originalFileName: dto.fileName,
            storageKey: dto.objectKey,
            mimeType: dto.mimeType,
            byteSize: dto.sizeBytes,
            status: UploadStatus.READY,
            uploadedBy: userId || (null as any),
            uploadedAt: now,
          }),
        );

        doc.currentVersionId = version.id;
        await docRepo.save(doc);

        const orderIndex = await imageRepo.count({
          where: { sampleRoundId: roundId },
        });
        const image = await imageRepo.save(
          imageRepo.create({
            sampleRoundId: roundId,
            documentVersionId: version.id,
            orderIndex,
          }),
        );

        const url = await this.storage.getPresignedGetUrl(
          dto.objectKey,
          PRESIGN_GET_EXPIRY_SECONDS,
        );

        return {
          id: image.id,
          url,
          fileName: dto.fileName,
          mimeType: dto.mimeType,
          orderIndex,
          uploadedAt: now,
        };
      })
      .catch((error) => {
        if (isDuplicateStorageKeyError(error)) {
          throw new BadRequestException(
            'Ảnh này đã được đính kèm trong hệ thống, không thể đính kèm lại.',
          );
        }
        throw error;
      });
  }

  async getImageDownloadUrl(
    styleId: string,
    roundId: string,
    imageId: string,
  ): Promise<StyleSampleImageDownloadUrlResult> {
    await this.assertStyleExists(styleId);
    await this.findRoundOrThrow(styleId, roundId);

    const row = await this.imageRepo
      .createQueryBuilder('img')
      .innerJoin(DocumentVersion, 'v', 'v.id = img.documentVersionId')
      .where('img.id = :imageId', { imageId })
      .andWhere('img.sampleRoundId = :roundId', { roundId })
      .select('v.storageKey', 'storageKey')
      .addSelect('v.originalFileName', 'fileName')
      .getRawOne<{ storageKey: string; fileName: string }>();

    if (!row) {
      throw new NotFoundException(`Không tìm thấy ảnh #${imageId}`);
    }

    const url = await this.storage.getPresignedGetUrl(
      row.storageKey,
      PRESIGN_GET_EXPIRY_SECONDS,
      row.fileName,
    );

    return { url, expiresIn: PRESIGN_GET_EXPIRY_SECONDS };
  }

  async removeImage(
    styleId: string,
    roundId: string,
    imageId: string,
  ): Promise<void> {
    await this.assertStyleExists(styleId);
    await this.findRoundOrThrow(styleId, roundId);

    const image = await this.imageRepo.findOne({
      where: { id: imageId, sampleRoundId: roundId },
    });
    if (!image) {
      throw new NotFoundException(`Không tìm thấy ảnh #${imageId}`);
    }
    await this.imageRepo.remove(image);
  }
}
