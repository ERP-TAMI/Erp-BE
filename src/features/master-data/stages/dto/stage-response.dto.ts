import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Stage } from '../../entities/Stage.entity';

export class StageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  stageCode: string;

  @ApiProperty()
  stageName: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ type: String, example: '12.500' })
  ssv: string;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  static fromEntity(stage: Stage): StageResponseDto {
    return {
      id: stage.id,
      stageCode: stage.stageCode,
      stageName: stage.stageName,
      description: stage.description ?? null,
      ssv: stage.defaultSsv,
      status: stage.status,
    };
  }
}
