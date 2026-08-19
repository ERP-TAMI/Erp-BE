import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateBomLineDto {
  @IsUUID('4')
  materialId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  consumptionPerUnit: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitCost?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex: number;
}
