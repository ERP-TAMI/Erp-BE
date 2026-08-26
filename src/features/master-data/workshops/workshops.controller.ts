import {
  Body,
  Controller,
  Get,
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
import { CreateWorkshopDto } from './dto/create-workshop.dto';
import { QueryWorkshopsDto } from './dto/query-workshops.dto';
import { UpdateWorkshopStatusDto } from './dto/update-workshop-status.dto';
import { UpdateWorkshopDto } from './dto/update-workshop.dto';
import { WorkshopResponseDto } from './dto/workshop-response.dto';
import { WorkshopsService } from './workshops.service';

@ApiTags('Workshops')
@ApiBearerAuth()
@Auth()
@Controller('masters/workshops')
export class WorkshopsController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  @Get()
  @ApiOkResponse({ type: WorkshopResponseDto, isArray: true })
  findAll(@Query() query: QueryWorkshopsDto): Promise<WorkshopResponseDto[]> {
    return this.workshopsService.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: WorkshopResponseDto })
  @ApiNotFoundResponse({ description: 'Workshop was not found' })
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WorkshopResponseDto> {
    return this.workshopsService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: WorkshopResponseDto })
  @ApiBadRequestResponse({ description: 'Workshop data is invalid' })
  @ApiConflictResponse({ description: 'Workshop code already exists' })
  create(@Body() dto: CreateWorkshopDto): Promise<WorkshopResponseDto> {
    return this.workshopsService.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: WorkshopResponseDto })
  @ApiBadRequestResponse({ description: 'Workshop data is invalid' })
  @ApiNotFoundResponse({ description: 'Workshop was not found' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateWorkshopDto,
  ): Promise<WorkshopResponseDto> {
    return this.workshopsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: WorkshopResponseDto })
  @ApiNotFoundResponse({ description: 'Workshop was not found' })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateWorkshopStatusDto,
  ): Promise<WorkshopResponseDto> {
    return this.workshopsService.updateStatus(id, dto);
  }
}
