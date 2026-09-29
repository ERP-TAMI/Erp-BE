import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StyleStatus } from '../../../common/enums/database.enums';
import { Style } from '../entities/Style.entity';

export class StyleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  styleCode: string;

  @ApiProperty()
  styleName: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  category: string | null;

  @ApiProperty({ enum: StyleStatus })
  status: StyleStatus;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Presigned S3 GET URL (resolved fresh on every read), never a raw object key',
  })
  baseImageKey: string | null;

  @ApiProperty()
  as3bCmBaseDays: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(entity: Style): StyleResponseDto {
    return {
      id: entity.id,
      styleCode: entity.styleCode,
      styleName: entity.styleName,
      description: entity.description,
      category: entity.category,
      status: entity.status,
      baseImageKey: entity.baseImageKey,
      as3bCmBaseDays: entity.as3bCmBaseDays,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
