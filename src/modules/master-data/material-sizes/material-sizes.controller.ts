import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums/database.enums';
import { MaterialSizesService } from './material-sizes.service';
class SizeDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  sizeCode: string;
  @IsOptional() @IsString() @MaxLength(50) barcode?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  currentStock?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  lowStockThreshold?: number;
}
class StatusDto {
  @IsEnum(RecordStatus) status: RecordStatus;
}
@Controller('masters/materials/:materialId/sizes')
export class MaterialSizesController {
  constructor(private readonly service: MaterialSizesService) {}
  @Get() list(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
  ) {
    return this.service.list(materialId);
  }
  @Post() create(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
    @Body() dto: SizeDto,
  ) {
    return this.service.create(materialId, dto);
  }
  @Patch(':id') update(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: Partial<SizeDto>,
  ) {
    return this.service.update(materialId, id, dto);
  }
  @Patch(':id/status') status(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: StatusDto,
  ) {
    return this.service.updateStatus(materialId, id, dto.status);
  }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) remove(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.remove(materialId, id);
  }
}
