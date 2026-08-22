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
import { CreateMaterialGroupDto } from './dto/create-material-group.dto';
import { MaterialGroupResponseDto } from './dto/material-group-response.dto';
import { QueryMaterialGroupsDto } from './dto/query-material-groups.dto';
import { UpdateMaterialGroupStatusDto } from './dto/update-material-group-status.dto';
import { UpdateMaterialGroupDto } from './dto/update-material-group.dto';
import { MaterialGroupsService } from './material-groups.service';

@ApiTags('Material Groups')
@Controller('masters/material-groups')
export class MaterialGroupsController {
  constructor(private readonly materialGroupsService: MaterialGroupsService) {}

  @Get()
  @ApiOkResponse({ type: MaterialGroupResponseDto, isArray: true })
  findAll(
    @Query() query: QueryMaterialGroupsDto,
  ): Promise<MaterialGroupResponseDto[]> {
    return this.materialGroupsService.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: MaterialGroupResponseDto })
  @ApiNotFoundResponse({ description: 'Material group was not found' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MaterialGroupResponseDto> {
    return this.materialGroupsService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: MaterialGroupResponseDto })
  @ApiConflictResponse({
    description: 'Code or normalized name already exists',
  })
  create(
    @Body() dto: CreateMaterialGroupDto,
  ): Promise<MaterialGroupResponseDto> {
    return this.materialGroupsService.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: MaterialGroupResponseDto })
  @ApiConflictResponse({ description: 'Code or name already exists' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialGroupDto,
  ): Promise<MaterialGroupResponseDto> {
    return this.materialGroupsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: MaterialGroupResponseDto })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialGroupStatusDto,
  ): Promise<MaterialGroupResponseDto> {
    return this.materialGroupsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Material group deleted' })
  @ApiConflictResponse({ description: 'A material references this group' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.materialGroupsService.remove(id);
  }
}
