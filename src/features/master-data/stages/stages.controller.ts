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
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../common/decorators/auth.decorator';
import { CreateStageDto } from './dto/create-stage.dto';
import { QueryStagesDto } from './dto/query-stages.dto';
import { StageResponseDto } from './dto/stage-response.dto';
import { UpdateStageSsvBulkDto } from './dto/update-stage-ssv-bulk.dto';
import { UpdateStageStatusDto } from './dto/update-stage-status.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { StagesService } from './stages.service';

@ApiTags('Stages')
@ApiBearerAuth()
@Auth()
@Controller('masters/stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Get()
  @ApiOkResponse({ type: StageResponseDto, isArray: true })
  findAll(@Query() query: QueryStagesDto): Promise<StageResponseDto[]> {
    return this.stagesService.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: StageResponseDto })
  @ApiNotFoundResponse({ description: 'Stage was not found' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<StageResponseDto> {
    return this.stagesService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: StageResponseDto })
  @ApiBadRequestResponse({ description: 'Stage data is invalid' })
  @ApiConflictResponse({ description: 'Stage code already exists' })
  create(@Body() dto: CreateStageDto): Promise<StageResponseDto> {
    return this.stagesService.create(dto);
  }

  @Patch('bulk-ssv')
  @ApiOkResponse({ type: StageResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'Bulk SSV data is invalid' })
  @ApiNotFoundResponse({ description: 'One or more stages were not found' })
  updateSsvBulk(
    @Body() dto: UpdateStageSsvBulkDto,
  ): Promise<StageResponseDto[]> {
    return this.stagesService.updateSsvBulk(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StageResponseDto })
  @ApiBadRequestResponse({ description: 'Stage data is invalid' })
  @ApiNotFoundResponse({ description: 'Stage was not found' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStageDto,
  ): Promise<StageResponseDto> {
    return this.stagesService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: StageResponseDto })
  @ApiNotFoundResponse({ description: 'Stage was not found' })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateStageStatusDto,
  ): Promise<StageResponseDto> {
    return this.stagesService.updateStatus(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNotFoundResponse({ description: 'Stage was not found' })
  @ApiConflictResponse({
    description: 'Stage is referenced by business data',
  })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.stagesService.remove(id);
  }
}
