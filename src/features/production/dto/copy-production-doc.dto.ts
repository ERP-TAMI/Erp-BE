import { IsUUID, IsEnum, IsOptional, IsArray, IsString, IsBoolean } from 'class-validator';

export enum CopyMode {
  FULL = 'FULL',
  EXCLUDE = 'EXCLUDE',
}

export class CopyProductionDocDto {
  @IsUUID()
  targetStyleId: string;

  @IsEnum(CopyMode)
  mode: CopyMode;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeSections?: string[];

  @IsOptional()
  @IsBoolean()
  confirmOverwrite?: boolean;
}
