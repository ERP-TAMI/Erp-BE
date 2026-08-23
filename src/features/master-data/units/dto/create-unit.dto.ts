import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUnitDto {
  @ApiProperty({ example: 'Cuộn', maxLength: 100 })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
