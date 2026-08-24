import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateStageGroupDto } from './create-stage-group.dto';

export class UpdateStageGroupDto extends PartialType(
  OmitType(CreateStageGroupDto, ['groupCode'] as const),
) {}
