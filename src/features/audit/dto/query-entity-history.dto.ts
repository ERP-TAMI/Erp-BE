import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class QueryEntityHistoryDto {
  @ApiProperty({ description: 'e.g. StyleOperationStep, PurchaseOrder' })
  @IsString()
  @MaxLength(80)
  aggregateType: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  aggregateId: string;
}
