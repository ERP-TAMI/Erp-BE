import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateStageDto } from './create-stage.dto';

export class UpdateStageDto extends PartialType(
  OmitType(CreateStageDto, ['stageCode'] as const),
) {}
