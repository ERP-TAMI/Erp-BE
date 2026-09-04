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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../common/decorators/auth.decorator';
import { Permission } from '../../../common/decorators/permission.decorator';
import { CreateMaterialGroupDto } from './dto/create-material-group.dto';
import { MaterialGroupResponseDto } from './dto/material-group-response.dto';
import { QueryMaterialGroupsDto } from './dto/query-material-groups.dto';
import { UpdateMaterialGroupStatusDto } from './dto/update-material-group-status.dto';
import { UpdateMaterialGroupDto } from './dto/update-material-group.dto';
import { MaterialGroupsService } from './material-groups.service';

const VIEW_PERMISSION = 'master_data.material_groups.view';
const MANAGE_PERMISSION = 'master_data.material_groups.manage';

@ApiTags('Material Groups')
@ApiBearerAuth()
@Auth(VIEW_PERMISSION)
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
  @Permission(MANAGE_PERMISSION)
  @ApiCreatedResponse({ type: MaterialGroupResponseDto })
  @ApiConflictResponse({
    description: 'Normalized name already exists',
  })
  create(
    @Body() dto: CreateMaterialGroupDto,
  ): Promise<MaterialGroupResponseDto> {
    return this.materialGroupsService.create(dto);
  }

  @Patch(':id')
  @Permission(MANAGE_PERMISSION)
  @ApiOkResponse({ type: MaterialGroupResponseDto })
  @ApiConflictResponse({ description: 'Name already exists' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialGroupDto,
  ): Promise<MaterialGroupResponseDto> {
    return this.materialGroupsService.update(id, dto);
  }

  @Patch(':id/status')
  @Permission(MANAGE_PERMISSION)
  @ApiOkResponse({ type: MaterialGroupResponseDto })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMaterialGroupStatusDto,
  ): Promise<MaterialGroupResponseDto> {
    return this.materialGroupsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Material group deleted' })
  @ApiConflictResponse({ description: 'A material references this group' })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.materialGroupsService.remove(id);
  }
}
