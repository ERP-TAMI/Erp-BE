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
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CreateStageGroupDto } from './dto/create-stage-group.dto';
import { QueryStageGroupsDto } from './dto/query-stage-groups.dto';
import {
  StageGroupResponseDto,
  StageGroupSummaryResponseDto,
} from './dto/stage-group-response.dto';
import { UpdateStageGroupStatusDto } from './dto/update-stage-group-status.dto';
import { UpdateStageGroupDto } from './dto/update-stage-group.dto';
import { StageGroupsService } from './stage-groups.service';

@ApiTags('Stage Groups')
@ApiBearerAuth()
@Auth()
@Controller('masters/stage-groups')
export class StageGroupsController {
  constructor(private readonly stageGroupsService: StageGroupsService) {}

  @Get()
  @ApiOkResponse({ type: StageGroupSummaryResponseDto, isArray: true })
  findAll(
    @Query() query: QueryStageGroupsDto,
  ): Promise<StageGroupSummaryResponseDto[]> {
    return this.stageGroupsService.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: StageGroupResponseDto })
  @ApiNotFoundResponse({ description: 'Stage group was not found' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<StageGroupResponseDto> {
    return this.stageGroupsService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: StageGroupResponseDto })
  @ApiBadRequestResponse({ description: 'Stage group data is invalid' })
  @ApiConflictResponse({ description: 'Stage group code already exists' })
  create(@Body() dto: CreateStageGroupDto): Promise<StageGroupResponseDto> {
    return this.stageGroupsService.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StageGroupResponseDto })
  @ApiBadRequestResponse({ description: 'Stage group data is invalid' })
  @ApiConflictResponse({ description: 'Stage group code already exists' })
  @ApiNotFoundResponse({ description: 'Stage group was not found' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStageGroupDto,
  ): Promise<StageGroupResponseDto> {
    return this.stageGroupsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: StageGroupResponseDto })
  @ApiNotFoundResponse({ description: 'Stage group was not found' })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStageGroupStatusDto,
  ): Promise<StageGroupResponseDto> {
    return this.stageGroupsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Stage group deleted' })
  @ApiNotFoundResponse({ description: 'Stage group was not found' })
  @ApiConflictResponse({
    description: 'Stage group is referenced by business data',
  })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.stageGroupsService.remove(id);
  }
}
