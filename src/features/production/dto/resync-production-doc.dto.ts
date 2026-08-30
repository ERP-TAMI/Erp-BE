import { IsOptional, IsArray, IsString, IsBoolean } from 'class-validator';

export class ResyncProductionDocDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: ('section1' | 'section2')[];

  @IsOptional()
  @IsBoolean()
  confirmOverwrite?: boolean;
}
