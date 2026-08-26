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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialResponseDto } from './dto/material-response.dto';
import { QueryMaterialsDto } from './dto/query-materials.dto';
import { UpdateMaterialStatusDto } from './dto/update-material-status.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialsService } from './materials.service';

@ApiTags('Materials')
@ApiBearerAuth()
@Auth()
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
  @ApiNotFoundResponse({ description: 'Material was not found' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MaterialResponseDto> {
    return this.materialsService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: MaterialResponseDto })
  @ApiBadRequestResponse({ description: 'Material data is invalid' })
  @ApiConflictResponse({ description: 'Material code already exists' })
  create(@Body() dto: CreateMaterialDto): Promise<MaterialResponseDto> {
    return this.materialsService.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: MaterialResponseDto })
  @ApiBadRequestResponse({ description: 'Material data is invalid' })
  @ApiConflictResponse({ description: 'Material code already exists' })
  @ApiNotFoundResponse({ description: 'Material was not found' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialDto,
  ): Promise<MaterialResponseDto> {
    return this.materialsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: MaterialResponseDto })
  @ApiNotFoundResponse({ description: 'Material was not found' })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialStatusDto,
  ): Promise<MaterialResponseDto> {
    return this.materialsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Material deleted' })
  @ApiNotFoundResponse({ description: 'Material was not found' })
  @ApiConflictResponse({ description: 'Business data references the material' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.materialsService.remove(id);
  }
}
