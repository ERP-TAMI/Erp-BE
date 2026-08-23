import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMaterialGroupDto {
  @ApiProperty({ example: 'Fabric', maxLength: 150 })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;
}
