import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserAccountStatus } from './user-account-status.enum';

export enum UserRoleCode {
  SA = 'SA',
  TPKH = 'TPKH',
  NVKH = 'NVKH',
  RD = 'RD',
  ACCOUNTING = 'ACCOUNTING',
  IT = 'IT',
}

export class QueryUsersDto {
  @ApiPropertyOptional({
    description: 'Search by full name, email or phone',
    maxLength: 255,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: UserRoleCode })
  @IsOptional()
  @IsEnum(UserRoleCode)
  role?: UserRoleCode;

  @ApiPropertyOptional({ enum: UserAccountStatus })
  @IsOptional()
  @IsEnum(UserAccountStatus)
  status?: UserAccountStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}
