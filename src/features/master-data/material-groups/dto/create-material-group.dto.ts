import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const normalizeCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMaterialGroupDto {
  @ApiPropertyOptional({
    example: 'FABRIC',
    maxLength: 50,
    description:
      'Optional legacy code. The server generates a stable internal code when omitted.',
  })
  @IsOptional()
  @Transform(normalizeCode)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ example: 'Fabric', maxLength: 150 })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;
}
