import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateMaterialDto {
  @ApiProperty({ example: 'COTTON-01', maxLength: 100 })
  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  materialCode: string;

  @ApiProperty({ example: 'Cotton fabric', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  materialName: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Must reference an active material group when creating.',
  })
  @IsUUID('4')
  materialGroupId: string;
}
