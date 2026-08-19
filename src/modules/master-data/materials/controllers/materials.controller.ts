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
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateMaterialDto } from '../dto/request/create-material.dto';
import { UpdateMaterialDto } from '../dto/request/update-material.dto';
import { UpdateMaterialStatusDto } from '../dto/request/update-material-status.dto';
import { QueryMaterialsDto } from '../dto/request/query-materials.dto';
import { MaterialResponseDto } from '../dto/response/material-response.dto';
import { MaterialsService } from '../services/materials.service';

@ApiTags('Materials')
@Controller('masters/materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}
  @Get()
  @ApiOkResponse({ type: MaterialResponseDto, isArray: true })
  findAll(@Query() query: QueryMaterialsDto): Promise<MaterialResponseDto[]> {
    return this.materialsService.findAll(query);
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
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Material deleted' })
  @ApiConflictResponse({
    description: 'Material is referenced by business data',
  })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.materialsService.remove(id);
  }
}
