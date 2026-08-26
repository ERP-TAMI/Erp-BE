import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { StageGroup } from '../../entities/StageGroup.entity';
import { StageGroupItem } from '../../entities/StageGroupItem.entity';

export class StageGroupItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  itemName: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ type: String, example: '12.500' })
  ssv: string;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  @ApiProperty({ minimum: 0 })
  orderIndex: number;

  static fromEntity(item: StageGroupItem): StageGroupItemResponseDto {
    return {
      id: item.id,
      itemName: item.itemName,
      description: item.description ?? null,
      ssv: item.ssv,
      status: item.status,
      orderIndex: item.orderIndex,
    };
  }
}

export class StageGroupSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  groupCode: string;

  @ApiProperty()
  groupName: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  @ApiProperty({ minimum: 0 })
  itemCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntity(
    group: StageGroup,
    itemCount: number,
  ): StageGroupSummaryResponseDto {
    return {
      id: group.id,
      groupCode: group.groupCode,
      groupName: group.groupName,
      description: group.description ?? null,
      status: group.status,
      itemCount,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}

export class StageGroupResponseDto extends StageGroupSummaryResponseDto {
  @ApiProperty({ type: StageGroupItemResponseDto, isArray: true })
  items: StageGroupItemResponseDto[];

  static fromEntities(
    group: StageGroup,
    items: StageGroupItem[],
  ): StageGroupResponseDto {
    return {
      ...StageGroupSummaryResponseDto.fromEntity(group, items.length),
      items: items
        .slice()
        .sort(
          (left, right) =>
            left.orderIndex - right.orderIndex ||
            (left.id || '').localeCompare(right.id || ''),
        )
        .map(StageGroupItemResponseDto.fromEntity),
    };
  }
}
