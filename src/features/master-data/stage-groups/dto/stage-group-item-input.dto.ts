import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class StageGroupItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  stageId: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  orderIndex: number;
}
