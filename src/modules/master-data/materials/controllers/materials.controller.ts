import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateMaterialDto } from '../dto/request/create-material.dto';
import { UpdateMaterialDto } from '../dto/request/update-material.dto';
import { UpdateMaterialStatusDto } from '../dto/request/update-material-status.dto';
import { MaterialResponseDto } from '../dto/response/material-response.dto';
import { MaterialsService } from '../services/materials.service';

@ApiTags('Materials')
@Controller('masters/materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}
  @Get()
  @ApiOkResponse({ type: MaterialResponseDto, isArray: true })
  findAll(): Promise<MaterialResponseDto[]> {
    return this.materialsService.findAll();
  }
  @Get(':id')
  @ApiOkResponse({ type: MaterialResponseDto })
  @ApiNotFoundResponse()
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MaterialResponseDto> {
    return this.materialsService.findOne(id);
  }
  @Post()
  @ApiCreatedResponse({ type: MaterialResponseDto })
  @ApiConflictResponse()
  create(@Body() dto: CreateMaterialDto): Promise<MaterialResponseDto> {
    return this.materialsService.create(dto);
  }
  @Patch(':id') @ApiOkResponse({ type: MaterialResponseDto }) update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialDto,
  ): Promise<MaterialResponseDto> {
    return this.materialsService.update(id, dto);
  }
  @Patch(':id/status')
  @ApiOkResponse({ type: MaterialResponseDto })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialStatusDto,
  ): Promise<MaterialResponseDto> {
    return this.materialsService.updateStatus(id, dto);
  }
}
