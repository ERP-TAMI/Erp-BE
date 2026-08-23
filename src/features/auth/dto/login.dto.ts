import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class LoginDto {
  @ApiProperty({ example: 'sa@tami.test' })
  @Transform(trimText)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Sup3rSecret!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
