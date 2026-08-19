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
import { CreateMaterialSizeDto } from './dto/request/create-material-size.dto';
import { UpdateMaterialSizeStatusDto } from './dto/request/update-material-size-status.dto';
import { UpdateMaterialSizeDto } from './dto/request/update-material-size.dto';
import { MaterialSizeResponseDto } from './dto/response/material-size-response.dto';
import { MaterialSizesService } from './material-sizes.service';

@Controller('masters/materials/:materialId/sizes')
export class MaterialSizesController {
  constructor(private readonly service: MaterialSizesService) {}

  @Get()
  list(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
  ): Promise<MaterialSizeResponseDto[]> {
    return this.service.list(materialId);
  }

  @Post()
  create(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
    @Body() dto: CreateMaterialSizeDto,
  ): Promise<MaterialSizeResponseDto> {
    return this.service.create(materialId, dto);
  }

  @Patch(':id')
  update(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialSizeDto,
  ): Promise<MaterialSizeResponseDto> {
    return this.service.update(materialId, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialSizeStatusDto,
  ): Promise<MaterialSizeResponseDto> {
    return this.service.updateStatus(materialId, id, dto.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('materialId', new ParseUUIDPipe({ version: '4' }))
    materialId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.service.remove(materialId, id);
  }
}
